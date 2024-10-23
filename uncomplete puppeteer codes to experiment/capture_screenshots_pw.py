import asyncio
from click.core import Context
from playwright.async_api import async_playwright
from pathlib import Path
import utils
import config
import time
import os
from collections import defaultdict
from utils import mark_coordinates, us_timestamp_str
from config import USER_AGENTS, MAIN_LOG_PATH, RAW_DOWNLOADS_DIR
import logging
import click
from playwright_stealth import stealth_async

home_dir= "/home/irfan/"
agent_name="ie_win"
#agent_name="chrome_android"

logs_dir="logs_/"

AFTER_CLICK_WAIT = 15000  # Time to wait after a succesful click
# The below will be used if there is no "frameStoppedLoading" event
PAGE_LOAD_TIMEOUT = 25000  # Max time to wait for a page load
#AFTER_LOAD_WAIT = 5 # TO PAUSE FOR A LITTLE BIT AFTER PAGE LOAD MESSAGE




# TODO: Try to remove elements whose parentElement <a> tag or the tag itself (href) points to home page.
# Images that are larger than 900 sq. pixels in area will be placed at the beginning of
# the Action list. The idea is that images and as are more likely to lead to links than others.
IMG_PREFERENCE_THRESHOLD = 900
SHORT_PAUSE = 5




# url_1 = 'http://www.foo.com/ba?a=b&c=d'
# url_2 = 'http://www.foo.com:80/bar?c=d;a=b'


# if utils.canonical_url(url_1)==utils.canonical_url(url_2):
#     print ("URLs are the same")





async def handle_request(request):
    print("REQUEST>> ", request.url)
    await request.continue_()

async def handle_response(response):
    print("RESPONSE<< ", response.url)


async def get_elems_js(tab):
    js_script = """
function elementDimensions(element, wHeight, wWidth) {
	var boundRect = element.getBoundingClientRect();
	var midy = boundRect.top + (boundRect.height / 2.0);
	var midx = boundRect.left + (boundRect.width / 2.0);
	if (boundRect.height != 0 && boundRect.width != 0 &&
		midy < wHeight && midx < wWidth && midy > 0 && midx > 0)
		return [midx, midy, boundRect.height, boundRect.width];
	else
		return [];
}
// Args: an array of element objects, window height and window width
// This function filters out elements that are
// (1) of size 0
// (2) Outside the viewport vertically or horizontally. 
// Returns a array of arrays
function filterElementArrays(elements, wHeight, wWidth) {
	var elem_sizes = [];
	for (var element of elements){
		elem = elementDimensions(element, wHeight, wWidth);
		if (elem.length > 0)
			elem_sizes.push(elem);
	}
	return elem_sizes;
}
// Similar to filterElementArrays but takes xpathResult object as
// one of the arguments
function filterXpathResults(xpathResults, wHeight, wWidth) {
	var elem_sizes = [];
	var element = xpathResults.iterateNext();
  	while (element) {
		elem = elementDimensions(element, wHeight, wWidth);
		if (elem.length > 0)
			elem_sizes.push(elem);
  		element = xpathResults.iterateNext();
  	}
  	return elem_sizes;
}
function getElementsByXpath(path) { 	
  	var xpathres =  document.evaluate(
  						path, document, null, 
  						XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
  	return xpathres;
}
// Returns 2 array of arrays representing element locations and sizes for 
// all elems (except <img> and <a>) and (<img> and <a>) elems. 
// The <img> and <a> elems are more likely to have interesting links and are
// hence preferred.
function getElementData() {
	var wHeight = window.innerHeight;
	var wWidth = window.innerWidth;
	var element_data = [];
    var divs_xpath = getElementsByXpath('//div[not(descendant::div) and not(descendant::td)]');
    var divs = filterXpathResults(divs_xpath, wHeight, wWidth);
    var tds_xpath = getElementsByXpath('//td[not(descendant::div) and not(descendant::td)]');
    var tds = filterXpathResults(tds_xpath, wHeight, wWidth);
    var iframe_elems = document.getElementsByTagName('iframe');
    var iframes = filterElementArrays(iframe_elems, wHeight, wWidth);
    var a_elems = document.getElementsByTagName('a');
    var as = filterElementArrays(a_elems, wHeight, wWidth);
    element_data = element_data.concat(divs, tds);
    var img_elems = document.getElementsByTagName('img');
    var imgs = filterElementArrays(img_elems, wHeight, wWidth);
    var prefs = imgs.concat(as, iframes)
    return [element_data, prefs];
}
;
    """
    await tab.add_script_tag(content=js_script)
    return_elems = await tab.evaluate("()=> getElementData()")

    return return_elems





# Tries to retain return elements with unique sizes, and unique mid-points
# On some pages there are very close click-points that don't do anything different.
# Hence we try to filter out elements that have spatially close click points.
async def get_unique_elements(elems):
    R = 100  # Coarseness in pixels for determining unique click points
    MAX_SAME_COORD = 2 # Don't allow more than 2 elements on same x or y coordinates.
    ret_elems = []
    prev_elems = set()  # Contains width and height of prev elements
    prev_mid_points = set()
    prev_x = defaultdict(int)
    prev_y = defaultdict(int)
    for elem in elems:
        if (elem[3], elem[2]) in prev_elems:
            continue
        coords = (elem[0], elem[1])
        mp_rounded = (utils.any_round(coords[0], R), utils.any_round(coords[1], R))
        if mp_rounded in prev_mid_points:
            continue
        # prev_x doesn't make sense at all in pages where all different kinds of elements are vertically aligned
        # for example: https://onlinetviz.com/american-crime-story/2/1
        if (prev_y[elem[1]] >= MAX_SAME_COORD):
            continue
        #print "debug, unique size elems", elem.size['width'], elem.size['height']
        ret_elems.append(elem)
        prev_elems.add((elem[3], elem[2]))
        prev_mid_points.add(mp_rounded)
        prev_x[elem[0]] += 1
        prev_y[elem[1]] += 1
    return ret_elems


def element_area(elem):
    return elem[2] * elem[3]

# Given a list of elements, Sort the elements by area,
async def filter_elements(elems, imgs):
    rest_imgs = []
    selected_imgs = []
    for img in imgs:
        if element_area(img) > IMG_PREFERENCE_THRESHOLD:
            selected_imgs.append(img)
        else:
            rest_imgs.append(img)

    # Giving preferential treatment to large images and placing them at the
    # beginning of the queue.
    imgs = sorted(selected_imgs, reverse=True, key=element_area)
    elems = elems + rest_imgs
    elems = sorted(elems, reverse=True, key=element_area)
    elems = imgs + elems

    elems =await get_unique_elements(elems)
    #print "filter_elements(): Retained only elements of unique size"

    elems = elems[:20]
    #print "filter_elements(): Sorted elements by size and got the first few ones"
    return elems


async def get_clickable_elements(tab, agent_name):
    #return [(275.0, 350.0)]

    elems, imgs = await get_elems_js(tab)
    elems =await filter_elements(elems, imgs)

    """
    for elem in elems[:10]:
        print "Element area: %s" % (element_area(elem))
    """
    #ipdb.set_trace()

    """
    im = Image.open(temp_ss_fname)
    draw = ImageDraw.Draw(im)
    for le in elems:
        draw.rectangle([(le.location['x'],
                         le.location['y']),
                        (le.location['x'] + le.size['width'],
                         le.location['y'] + le.size['height'])],
                       fill=None,
                       outline='blue')
        click_coords = (le.location['x'] + (le.size['width'] / 2.0),
                        le.location['y'] + (le.size['height'] / 2.0))
        draw.ellipse((click_coords[0] - 10, click_coords[1] - 10,
                      click_coords[0] + 10, click_coords[1] + 10),
                     fill='red',
                     outline='red')
    im.save(temp_ss_fname)
    """

    #raw_input("Check it!")
    elem_coords = []
    for elem in elems:
        #print elem[0], elem[1]
        elem_coords.append((elem[0], elem[1]))

    # Ensuring that there is at least one click point all the time
    if len(elem_coords) == 0:
        width, height = config.USER_AGENTS[agent_name]['window_size_cmd']
        click_point = (width/2, height/2)
        #ipdb.set_trace()
        elem_coords.append(click_point)
    return elem_coords

async def handle_target(t):
    print('target created')
    print(t.type)
    if t.type =='page':
        p = await t.page()
        print("new page created")
        print(p)
        await p.evaluate("""()=>{alert('page  opened!!!')}""")
 


# async def handle_page(page):    
#     await page.wait_for_load_state()    
#     print(await page.title())











async def capture_screenshot_pwright(url: str, path: Path, viewport_width: int, viewport_height: int) -> None:
    async with async_playwright() as p:
        starting_time=time.time()
        argss = [
            ##"--disable-gpu",
            "--disable-web-security",
            "--disable-xss-auditor",    
            "--allow-running-insecure-content",
             ##"--disable-webgl",
             "--disable-popup-blocking",
             '--disable-dev-shm-usage',
        ]
        if not os.path.isdir(logs_dir):
            os.mkdir(logs_dir)
        
        global browser
        
        if config.USER_AGENTS[agent_name]['mobile'] is False:
            is_mobile=False

            browser = await p.chromium.launch_persistent_context(headless=True,
                                          executable_path=home_dir+"chromium/src/out/Irfan/chrome",
                                          user_data_dir=home_dir+"chrome_user/",
                                          user_agent=config.USER_AGENTS[agent_name]['user_agent'],
                                          viewport={ 'width': config.USER_AGENTS[agent_name]['window_size_cmd'][0], 'height': config.USER_AGENTS[agent_name]['window_size_cmd'][1] },  
                                          device_scale_factor=1,
                                          locale='en-US',  
                                          timezone_id='America/New_York',
                                          permissions=['notifications','geolocation'],
                                          args=argss)
        else:
            is_mobile=True
            browser = await p.chromium.launch_persistent_context(headless=True,
                                          executable_path=home_dir+"chromium/src/out/Irfan/chrome",
                                          user_data_dir=home_dir+"chrome_user/",
                                          user_agent=config.USER_AGENTS[agent_name]['user_agent'],
                                          viewport={ 'width': config.USER_AGENTS[agent_name]['window_size_cmd'][0], 'height': config.USER_AGENTS[agent_name]['window_size_cmd'][1] },   
                                          device_scale_factor=1,
                                          locale='en-US',  
                                          timezone_id='America/New_York',
                                          permissions=['notifications','geolocation'],
                                          args=argss,
                                          has_touch=is_mobile)


        #if you want to start the browser without persistent context
        # browser = await p.chromium.launch(headless=False,
        #                                   executable_path=home_dir+"chromium/src/out/Irfan/chrome")
        #                                   #user_data_dir=home_dir+"chrome_user/")

        # context = await browser.new_context(
        #     user_agent=config.USER_AGENTS[agent_name]['user_agent'],
        #     viewport={ 'width': 1920, 'height': 1080 },  
        #     device_scale_factor=1,
        #     locale='en-US',  
        #     timezone_id='America/New_York',
        #     permissions=['notifications','geolocation'],
        # )
        #await context.grant_permissions(['geolocation'])
        #page = context.pages[0]
        browser.on('targetcreated', lambda t: asyncio.ensure_future(handle_target(t)))
      
        #page = await context.new_page()
        page = browser.pages[0]
        #await stealth_async(page)
        #page = await context.new_page()
        #page = context.pages[1]
        #print(len(context.pages))
 
         


        #await page.goto(url,wait_until="networkidle")
        await page.goto(url,timeout=PAGE_LOAD_TIMEOUT)
        #await page.wait_for_timeout(20000)
        await page.screenshot(path="{}.png".format(path)) 



        elem_coords=await get_clickable_elements(page,agent_name)
        url= await page.evaluate("() => window.location.href")
        tabCount=len(browser.pages)
        print(tabCount)

        
 
        # await page.click("text=Check for yourself",button='middle')
        # await page.wait_for_timeout(AFTER_CLICK_WAIT)
        # #page_next =await stealth_async(browser.pages[1])
        # page_next =browser.pages[1]
        # await page_next.screenshot(path="{}_next_stealth.png".format(path)) 




        for i in range(len(elem_coords)):
            
            if is_mobile:
                await page.touchscreen.tap(elem_coords[i][0], elem_coords[i][1])

            else:
                #await page.mouse.move(int(elem_coords[i][0]), int(elem_coords[i][1]))
                await page.mouse.move(elem_coords[i][0], elem_coords[i][1])
                await page.wait_for_timeout(500)
                await page.mouse.down()
                await page.wait_for_timeout(150)
                await page.mouse.up()

                
 
                
 
            
            await page.wait_for_timeout(AFTER_CLICK_WAIT)
            

            tab_count_clicked=len(browser.pages)
            print("tab_count_clicked")
            click.echo(tab_count_clicked)
            if tab_count_clicked==tabCount:
                
                url_next = await page.evaluate("() => window.location.href")
                print(url_next)
                if url_next!=url:
                    if utils.canonical_url(url_next)!=utils.canonical_url(url):
                        #await page.wait_for_load_state("domcontentloaded")
                        click.echo("new page opened in the same tab")
                        print ("Visited URLs are not in the same domain")
                        await page.screenshot(path="{}_TAB_{}.png".format(path,i) )
                        await page.go_back(timeout= 30000,wait_until="load")
                        #await page.waitFor(10000)
                
                else:
                    if url_next!=url:
                        click.echo("new page opened in the same tab")
                        print ("Visited URLs are in the same domain")
                        await page.go_back(timeout= 30000,wait_until="load")
                        continue

                    else:
                        continue

            else:
            #More than one tabs are opening and also at the same time the page in the main tab 
            #changes. I am taking the screenshots of them, going back at the main tab and continue clicking       

                while tab_count_clicked != tabCount:
                   click.echo("new page opened in new tab")
                   click.echo("tab_count_clicked")
                   click.echo(tab_count_clicked)
                   tab_count_clicked=len(browser.pages)
                   page_next= browser.pages[tab_count_clicked-1]
                   #await stealth_async(page_next)
                   url_next = await page_next.evaluate("() => window.location.href")
                   print(url_next)
                   
                   #await page_next.wait_for_load_state("domcontentloaded")
                   if page_next is None:
                      click.echo("empty tab..skipping")
                      tab_count_clicked=tab_count_clicked-1
                      await page_next.close() 
                      continue
                   if url_next=="about:blank":
                      click.echo("empty tab..skipping")  
                      tab_count_clicked=tab_count_clicked-1
                      await page_next.close() 
                      continue

                   if utils.canonical_url(url_next)==utils.canonical_url(url):
                      print("new tab has the same domain with the initial page.. skipping")
                      tab_count_clicked=tab_count_clicked-1 
                      await page_next.close()
                      continue

                   

                   await page_next.screenshot(path="{}_TAB_{}_{}.png".format(path,i,tab_count_clicked-1))

                   #await page_next.set_viewport_size({ 'width': 360, 'height': 740 })
                   #await page.wait_for_timeout(3000)
                   await page_next.screenshot(path="{}_TAB_{}_{}_reducedres.png".format(path,i,tab_count_clicked-1))

                   await page_next.close() 
                   tab_count_clicked=tab_count_clicked-1




                url_next = await page.evaluate("() => window.location.href")
                #if url_next!=url:
                if utils.canonical_url(url_next)!=utils.canonical_url(url):
                    #await page.wait_for_load_state("domcontentloaded")
                    click.echo("There are new tabs opened, but the current tab has also changed and domains are different")
                    await page.screenshot( path="{}_TAB_{}_same.png".format(path,i))
                    await page.go_back(timeout= 30000,wait_until="load")
                else:
             
                    if url_next!=url:
                        click.echo("new page opened in the same tab")
                        print ("Visited URLs are in the same domain")
                        await page.go_back(timeout= 30000,wait_until="load")
                        continue

                    else:
                        #no change
                        continue
                    




        await browser.close()
        execution_time="Waited for {} seconds to run the session".format(time.time()-starting_time)
        click.echo(execution_time)

#asyncio.run(main())  //at initial code




@click.group()
def cli():
    pass
#



@cli.command()
@click.option('--url')
@click.option('--viewport_width', default=USER_AGENTS[agent_name]['window_size_cmd'][0])
@click.option('--viewport_height', default=USER_AGENTS[agent_name]['window_size_cmd'][1])
@click.option('--filename', default="%s%s" % (logs_dir,us_timestamp_str(),))


def screenshot(url, viewport_width, viewport_height, filename):
    click.echo("Capturing screenshot...")
    original_path = str(Path(filename))
    #resized_path = Path(resized_filename)
    asyncio.get_event_loop().run_until_complete(capture_screenshot_pwright(url, original_path, viewport_width, viewport_height))
    #resize_screenshot(original_path, resized_path, width, height)
    click.echo("Done")




if __name__ == "__main__":
    cli()








































