import asyncio
from pathlib import Path
import click
from pyppeteer import launch
from PIL.Image import core as _imaging
#from PIL import Image
import utils
import config
import time
import os
from collections import defaultdict

from utils import mark_coordinates, us_timestamp_str
from config import USER_AGENTS, MAIN_LOG_PATH, RAW_DOWNLOADS_DIR
import logging

home_dir= "/home/irfan/"
agent_name="chrome_mac"
logs_dir="logs_/"






# TODO: Try to remove elements whose parentElement <a> tag or the tag itself (href) points to home page.
# Images that are larger than 900 sq. pixels in area will be placed at the beginning of
# the Action list. The idea is that images and as are more likely to lead to links than others.
IMG_PREFERENCE_THRESHOLD = 900
SHORT_PAUSE = 5




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
    await tab.addScriptTag({'content': js_script})
    return_elems = await tab.evaluate("()=> getElementData()")
    #click.echo(return_elems)
    #return_elems =await tab.Runtime.evaluate(expression=js_script, returnByValue=True)
    #return_elems =await tab.evaluate(js_script)
    #return_elems = return_elems['result']['value']
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












async def capture_screenshot(url: str, path: Path, viewport_width: int, viewport_height: int) -> None:
    starting_time=time.time()
    
    
    if not os.path.isdir(logs_dir):
        os.mkdir(logs_dir)
    global browser
    #browser = await launch(headless=True, executablePath=home_dir+"chromium/src/out/Irfan/chrome", userDataDir=home_dir+"chrome_user/",ignoreHTTPSErrors=True, args=['--no-sandbox'])
    #browser = await launch(headless=True, executablePath=home_dir+"chromium/src/out/Irfan/chrome", userDataDir=home_dir+"chrome_user/",args=['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-setuid-sandbox'])
    browser = await launch(headless=False, executablePath=home_dir+"chromium/src/out/Irfan/chrome",
                           userDataDir=home_dir+"chrome_user/")    
    #logger = logging.getLogger(log_id)
    #logging.basicConfig(filename="/home/phani/se-hunter/logs/sample/python_test_here.log", level=logging.INFO)
    #logger.info("***Started***")
    #https://install.streaminsearchs.com/?pid=59463&subid=4268795&clickid=16328737193330871856105586557617068&did=fdc4b44a-d073-4093-9338-62e1342f5f01&pgs=1

   #https://www.getsmartyapp.com/landers/lander1.php?sid=09282021_adcash1cpa_4268795_4268795&clkid=16328737673330871856275061653173967&cid=lander1&partner=adcash

    # browser = await launch({"headless": False,
    #                         "args": ['--ignore-certificate-errors'
    #                                  '--allow-running-insecure-content',
    #                                  '--disable-xss-auditor',
    #                                  '--no-sandbox',
    #                                  '--disable-setuid-sandbox']})



    js_script_sw_check="""
        function getElementData() {
       
         if(target._targetInfo.type=='page'){
           var p = await target.page()                
           p.once('load',  async function(){
             console.log('page loaded')
             //networkidle0 - consider navigation to be finished when there are no more than 0 network connections for at least 500 ms.
             //networkidle2 - consider navigation to be finished when there are no more than 2 network connections for at least 500 ms.
             //https://stackoverflow.com/questions/52497252/puppeteer-wait-until-page-is-completely-loaded
             try{
                 try{
                     await p.waitForNavigation('networkidle2', timeout=90000)}
                 catch(e)
                 {
                   console.log('timeout!!')
                   
                 }

                 // Check if Service worker was installed after a delay of 30 secs
                 await setTimeout(async function() {
                   const sw_found = await p.evaluate(()=> { return navigator.serviceWorker.controller} )
                   if (sw_found!= null)
                     console.log('Service Worker Found!!!')
                     click.echo('Service Worker Found!!!')
                   else 
                     console.log('Service Worker NOT Found!!!')
                     click.echo('Service Worker NOT Found!!!')
                 }, 30000)

             }catch(e){
               console.log(e)
             } 
           })   	
         }

     }

    """

    #browser.once('targetcreated', lambda target: result_page.set_result(target))

    page= (await browser.pages())[0]
    #page = await browser.newPage()
    await page.setUserAgent(config.USER_AGENTS[agent_name]['user_agent']);



    #await browser.addScriptTag({'content': js_script_sw_check})
    #browser.once('targetcreated', lambda target: js_script_sw_check)
    #await page.addScriptTag({'content': js_script_sw_check})
    #await page.evaluate("(%s)=> ()",br)

   

    #await page.setRequestInterception(True)

    #page.on('response', handle_response)
    #page.on('request', handle_request)
    #page.on('request', lambda req: asyncio.ensure_future(requesthandler(handle_request)))

    #await page.setViewport({'width': viewport_width, 'height': viewport_height})


    await page.setViewport({
        'width': viewport_width,
        'height': viewport_height,
        'deviceScaleFactor': config.USER_AGENTS[agent_name]['device_scale_factor'],
        'isMobile': config.USER_AGENTS[agent_name]['mobile'],
        'hasTouch': config.USER_AGENTS[agent_name]['mobile']
        #'isLandscape': false
      });




    await page.waitFor(1000);
    #await page.goto(url, waitUntil=["networkidle0", "domcontentloaded"])
    options = {'timeout': 25000,'waitUntil':["load"]}
    await page.goto(url, options)
    await page.waitFor(5000);
    #await page.goto(url)
    await page.screenshot({'path':"{}.png".format(path)})
    elem_coords=await get_clickable_elements(page,agent_name)

    url= await page.evaluate("() => window.location.href")
    tabCount=len(await browser.pages())
    for i in range(len(elem_coords)):
        #tabCount=len(await browser.pages())
        #await asyncio.wait([page.mouse.click(elem_coords[i][0], elem_coords[i][1]), page.waitForNavigation()])
        #await page.mouse.click(elem_coords[i][0], elem_coords[i][1])




        # function_name = "Input.emulateTouchFromMouseEvent" if config.USER_AGENTS[agent_name]['mobile'] else "Input.dispatchMouseEvent"
        # page.call_method(function_name,
        #                 type="mouseMoved",
        #                 x=elem_coords[i][0], y=elem_coords[i][1],
        #                 button="none",
        #                 timestamp=int(time.time()))
        # browser.close()

        # await page.hover('#loginbutton');
        # await page.waitFor(1000);



        #click.echo(elem_coords)
        await page.mouse.move(int(elem_coords[i][0]), int(elem_coords[i][1]))
        await page.waitFor(500)
        await page.mouse.down()
        await page.waitFor(150)
        await page.mouse.up()
        await page.waitFor(20000)




        #await page.waitForNavigation()

        
        
        tab_count_clicked=len(await browser.pages())
        click.echo("tab_count_clicked")
        click.echo(tab_count_clicked)

        if tab_count_clicked==tabCount:
            url_next = await page.evaluate("() => window.location.href")
            if url_next!=url:
                
                click.echo("new page opened in the same tab")
                #await page.waitForNetwork({ "waitUntil": 'networkidle0' })
                #await page.waitForNavigation()
                #await page.waitForSelector('*')
                await page.screenshot({ 'path': "%s_TAB_%s.png" % (path,i,) })
                await page.goBack({'timeout': 20000,'waitUntil':["load"]})
                await page.waitFor(10000)
                
            else:
                continue
             

        else:
            #More than one tabs are opening and also at the same time the page in the main tab 
            #changes. I am taking the screenshots of them, going back at the main tab and continue clicking

            # for x in range(6,4,-1):
            #     print(x) 
            #     6
            #     5

            #pages= (await browser.pages())[tab_count_clicked-1]
            #if there are more than one new tabs opened, We have to handle it
            #for x in range(tab_count_clicked,tabCount,-1):
            while tab_count_clicked != tabCount:
               click.echo("new page opened in new tab")
               click.echo("tab_count_clicked")
               click.echo(tab_count_clicked)
               tab_count_clicked=len(await browser.pages())
               click.echo(tab_count_clicked)
               #click.echo("new page opened in new tab") 
               
               pages= (await browser.pages())[tab_count_clicked-1]
               if pages is None:
                 click.echo("empty tab..skipping")
                 await pages.close() 
                 continue


               click.echo(tab_count_clicked)
               #await pages.waitForNetwork({ "waitUntil": 'networkidle0' })
               #await pages.waitForNavigation()
               #await pages.waitForSelector('*')
               #await pages.setViewport({'width': viewport_width, 'height': viewport_height})
               click.echo(tab_count_clicked)

               await pages.setViewport({
                'width': viewport_width,
                'height': viewport_height,
                'deviceScaleFactor': config.USER_AGENTS[agent_name]['device_scale_factor'],
                'isMobile': config.USER_AGENTS[agent_name]['mobile'],
                'hasTouch': config.USER_AGENTS[agent_name]['mobile']
                #'isLandscape': false
              });
               #await pages.setUserAgent(config.USER_AGENTS["ie_win"]['user_agent']);




               #have to wait a little bit after setting viewport, otherwise the page seems chaotic
               await page.waitFor(5000) 
           
               
               await pages.screenshot({ 'path': "%s_TAB_%s_%s.png" % (path,i,tab_count_clicked-1) })


               await pages.setViewport({
                'width': 768,
                'height': 1366,
                'deviceScaleFactor': config.USER_AGENTS[agent_name]['device_scale_factor'],
                'isMobile': config.USER_AGENTS["chrome_android"]['mobile'],
                'hasTouch': config.USER_AGENTS["chrome_android"]['mobile']
                #'isLandscape': false
              });

               await page.waitFor(5000) 
           
               
               await pages.screenshot({ 'path': "%s_TAB_%s_%s_mobile.png" % (path,i,tab_count_clicked-1) })

               await pages.close() 
               tab_count_clicked=tab_count_clicked-1



            url_next = await page.evaluate("() => window.location.href")
            if url_next!=url:
                #await page.waitFor({ "waitUntil": 'networkidle0' })
                click.echo("There are new tabs opened, but the current tab has also changed")
                #await page.waitForNavigation()
                #await page.waitForSelector('*')
                await page.screenshot({ 'path': "%s_TAB_%s_same.png" % (path,i,) })
                await page.goBack()
                #await page.waitFor(1 * 15000);
                await page.waitFor(5000) 
          






  
    await browser.close()
    execution_time="Waited for {} seconds to run the session".format(time.time()-starting_time)
    click.echo(execution_time)


    #click.echo("here screenshot...")
    #version = await page.browser.version()
    #click.echo(version)
    


# def resize_screenshot(original_path: Path, resized_path: Path, width: int, height: int) -> None:
#     im = Image.open(original_path)
#     im.thumbnail((width, height))
#     im.save(resized_path)


@click.group()
def cli():
    pass
#



@cli.command()
@click.option('--url')
@click.option('--viewport_width', default=USER_AGENTS[agent_name]['window_size_cmd'][0])
@click.option('--viewport_height', default=USER_AGENTS[agent_name]['window_size_cmd'][1])

#@click.option('--width', default=700)
#@click.option('--height', default=466)
@click.option('--filename', default="%s%s" % (logs_dir,us_timestamp_str(),))
#@click.option('--resized_filename', default='screenshot_resized.png')
#@click.option('--enable-features',default='NetworkService')
# @click.option('--disable-setuid-sandbox')
# @click.option('--ignore-certificate-errors')
# @click.option('--disable-gpu')filename

def screenshot(url, viewport_width, viewport_height, filename):
    click.echo("Capturing screenshot...")
    original_path = str(Path(filename))
    #resized_path = Path(resized_filename)
    asyncio.get_event_loop().run_until_complete(capture_screenshot(url, original_path, viewport_width, viewport_height))
    #resize_screenshot(original_path, resized_path, width, height)
    click.echo("Done")




if __name__ == "__main__":
    #us_timestamp = us_timestamp_str()
    #file_name = "%s.png" % (us_timestamp,)
    #file_path = os.path.join(screenshots_dir_path,file_name)



    cli()


































# async def handle_request(request):
#     print("REQUEST: ", request.url)
#     await request.continue_()

# async def handle_response(response):
#     print("RESPONSE: ", response.url)

# async def main():
#     browser = await launch()
#     page = await browser.newPage()
#     await page.setRequestInterception(True)

#     page.on('response', handle_response)
#     page.on('request', handle_request)

#     await page.goto(url, waitUntil=["networkidle0", "domcontentloaded"])
#     await browser.close()

# asyncio.get_event_loop().run_until_complete(main()) 











# https://stackoverflow.com/questions/64524304/how-to-open-url-in-new-tab-with-pyppeteer

# result_page = asyncio.get_event_loop().create_future() # create new promise

# # bind promise to watch event targetcreated, must before click to link
# browser.once('targetcreated', lambda target: result_page.set_result(target))

# await link.click({button: 'middle'});     # click link and open to other tab

# page_in_new_tab = await (await result_page).page() # page in new tab here



# $x("//a[@class='js-gps-track nav-links--link'][contains(text(), 'Users')]")

# $x("//a[@class='js-gps-track nav-links--link']")

# page.querySelector('a.js-gps-track nav-links--link')




    
    #element = await page.querySelector('a#nav-users')


    #two lines below are working
    #tabCount=len(await browser.pages())
    #element = await page.Jx("//div[@class='flex--item truncate'][contains(text(), 'Users')]")
    #await asyncio.wait([element[0].click(), page.waitForNavigation()])
    #await element[0].click()
    #await page.waitForNavigation()
    #element = await page.querySelector('a.js-gps-track nav-links--link')
    # apply click function to our element
    #await element.click()
    #await page.mouse.click(rect.x + offset.x, rect.y + offset.y);
    #await page.mouse.click(elem_coords[0][0], elem_coords[0][1]);
    #await page.waitForNavigation();
    #tabCount=len(await browser.pages())