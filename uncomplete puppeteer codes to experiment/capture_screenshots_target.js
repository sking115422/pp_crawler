// filtreleme,networkidle dene, timeoutlari kisalt,argumanla calis,flowchart cikart

'use strict';
var utils = require('./utils');
var config=require('./config');
const logs_dir="logs/"
const home_dir= "/home/irfan/"
const AFTER_CLICK_WAIT = 3000  //Time to wait after a succesful click
// The below will be used if there is no "frameStoppedLoading" event
const PAGE_LOAD_TIMEOUT = 30000  // Max time to wait for a page load
//AFTER_LOAD_WAIT = 5 # TO PAUSE FOR A LITTLE BIT AFTER PAGE LOAD MESSAGE
const WAIT_AFTER_RESIZE=3000
// TODO: Try to remove elements whose parentElement <a> tag or the tag itself (href) points to home page.
//Images that are larger than 900 sq. pixels in area will be placed at the beginning of
// the Action list. The idea is that images and as are more likely to lead to links than others.
// TODO: Try to remove elements whose parentElement <a> tag or the tag itself (href) points to home page.
//Images that are larger than 900 sq. pixels in area will be placed at the beginning of
// the Action list. The idea is that images and as are more likely to lead to links than others.
var IMG_PREFERENCE_THRESHOLD = 900
var SHORT_PAUSE = 5
// //Tries to retain return elements with unique sizes, and unique mid-points
// //On some pages there are very close click-points that don't do anything different.
// //Hence we try to filter out elements that have spatially close click points.

  if (process.argv[2]) {
   var url = process.argv[2];
  //  var site_id =process.argv[3];
  //  var i_count = process.argv[4];
  //  var timeout = process.argv[5];
  //  crawl_url(url,site_id,i_count,timeout)

   }

// Viewport && Window size
var agent_name="chrome_linux"

var rand_viewports=[]
if(config.USER_AGENTS[agent_name]["mobile"]){
  rand_viewports=config.USER_AGENTS[agent_name]["window_size_cmd"]
}else{
  rand_viewports=utils.getRandViewports(config.USER_AGENTS[agent_name]["window_size_cmd"])
}


var width=rand_viewports.slice(-1)[0][0]
var height=rand_viewports.slice(-1)[0][1]
console.log(width+"*"+height)
var site_id ='logs';
var timeout = 3600; // 1 hour

// var url='https://www1.123movies.cafe/123movies/'
// https://stackoverflow.com/questions/59841557/pyppeteer-how-to-goto-next-page-by-clicking-sub-link-href-in-a-page-using-pyt
// var url = 'https://stackoverflow.com/questions/59841557/pyppeteer-how-to-goto-next-page-by-clicking-sub-link-href-in-a-page-using-pyt';
// /var url = 'https://intoli.com/blog/making-chrome-headless-undetectable/';
// https://www.york.ac.uk/teaching/cws/wws/webpage3.html
// var url="https://stackoverflow.com/questions/53934397/puppeteer-delete-navigator-webdriver"
// var url="https://bot.sannysoft.com/"
// var url='https://www.zillow.com/homedetails/1960-Ferentz-Trce-Norcross-GA-30071/80155574_zpid/'
// var url='https://whatismyviewport.com/';
// var url="https://www.zillow.com/homedetails/1960-Ferentz-Trce-Norcross-GA-30071/80155574_zpid/"
//var url = 'https://intoli.com/blog/making-chrome-headless-undetectable/chrome-headless-test.html';
//var url = 'https://gauntface.github.io/simple-push-demo/';
// var url='https://stackoverflow.com/questions/59841557/pyppeteer-how-to-goto-next-page-by-clicking-sub-link-href-in-a-page-using-pyt'


async function get_unique_elements(elems){


    var skip_it=false
    var R = 100;  //Coarseness in pixels for determining unique click points
    var MAX_SAME_COORD = 2 //Don't allow more than 2 elements on same x or y coordinates.
    const ret_elems = []
    const prev_elems =new Set()  //Contains width and height of prev elements
    const prev_mid_points =new Set()
    const prev_x = new utils.DefaultDict(Number)
    const prev_y = new utils.DefaultDict(Number)
    var mp_rounded;
    for (const elem in elems){

         for (let item of prev_elems.keys()) {
            if(item.toString() == [elems[elem][3],elems[elem][2]].toString())
            skip_it=true
               continue
            //true on match.
          }
          if(skip_it==true){
            skip_it=false
            continue
          }
        const coords = [elems[elem][0], elems[elem][1]]

        mp_rounded = [utils.any_round(coords[0], R), utils.any_round(coords[1], R)]
        if (prev_mid_points.has(mp_rounded)){
            continue;
        }
        for (let item of prev_mid_points.keys()) {
          if(item.toString() == mp_rounded.toString())
          skip_it=true
             continue
          //true on match.
        }
        if(skip_it==true){
          skip_it=false
          continue
        }
        // prev_x doesn't make sense at all in pages where all different kinds of elements are vertically aligned
        //for example: https://onlinetviz.com/american-crime-story/2/1
        if (prev_y[elems[elem][1]] >= MAX_SAME_COORD){
            continue;
        }
        //print "debug, unique size elems", elem.size['width'], elem.size['height']
        ret_elems.push(elems[elem])
        prev_elems.add([elems[elem][3],elems[elem][2]])
        prev_mid_points.add(mp_rounded)
        prev_x[elems[elem][0]] += 1
        prev_y[elems[elem][1]] += 1
    }

    return ret_elems
};
function element_area(elem){
  return elem[2] * elem[3]
}
// //Given a list of elements, Sort the elements by area,
async function filter_elements(elems, imgs,width,height){
    const rest_imgs = []
    const selected_imgs = []
    for (const img in imgs){
      if (element_area(imgs[img]) > IMG_PREFERENCE_THRESHOLD){
          selected_imgs.push(imgs[img])
      }
      else{
          rest_imgs.push(imgs[img])
        }
  }
    imgs = utils.sorted(selected_imgs, {key: x=>x[2]*x[3], reverse: true})
    elems = elems.concat(rest_imgs)
    elems = utils.sorted(elems, {key: x=>x[2]*x[3], reverse: true})
    elems = imgs.concat(elems)
    elems =await get_unique_elements(elems)
    elems = elems.slice(0, 20);
    const elem_coords = []
    for (const elem in elems){
        elem_coords.push([elems[elem][0], elems[elem][1]])
     }
    if (elem_coords.length == 0){

        //width, height = config.USER_AGENTS[agent_name]['window_size_cmd']

        var click_point = [width/2, height/2]

        // elem_coords.push([click_point])
        elem_coords.push(click_point)

    }
    return elem_coords
}
process.on('unhandledRejection', error => {
   // Prints "unhandledRejection woops!"
   console.log(site_id+' :: '+url)
     console.log('unhandledRejection', error);
 })


async function resizeandTakeScreenshot(screenshot_name,agent_name,page_next){
     if(config.USER_AGENTS[agent_name]["mobile"]){
          for (const q in config.USER_AGENTS[agent_name]["window_size_cmd"]){
            width=config.USER_AGENTS[agent_name]["window_size_cmd"][q][0]
            height=config.USER_AGENTS[agent_name]["window_size_cmd"][q][1]
            await page_next.setViewport({ width: width,
                                   height:height ,
                                   deviceScaleFactor:config.USER_AGENTS[agent_name]["device_scale_factor"],
                                   isMobile:config.USER_AGENTS[agent_name]["mobile"],
                                   hasTouch:config.USER_AGENTS[agent_name]["mobile"],
                                   isLandscape: config.USER_AGENTS[agent_name]["isLandscape"]})
              await page_next.waitForTimeout(WAIT_AFTER_RESIZE)



              await page_next.screenshot({ path: screenshot_name+'_'+width+height+'_mobi_'+utils.between(0,10000)+'.png', type: 'png' });

         }
      }else{

        const rand_viewports=utils.getRandViewports(config.USER_AGENTS[agent_name]["window_size_cmd"])
        for (const q in rand_viewports){
          width=rand_viewports[q][0]
          height=rand_viewports[q][1]
          await page_next.setViewport({ width: width,
                                 height:height ,
                                 deviceScaleFactor:config.USER_AGENTS[agent_name]["device_scale_factor"],
                                 isMobile:config.USER_AGENTS[agent_name]["mobile"],
                                 hasTouch:config.USER_AGENTS[agent_name]["mobile"],
                                 isLandscape: config.USER_AGENTS[agent_name]["isLandscape"]})
            await page_next.waitForTimeout(WAIT_AFTER_RESIZE)



            await page_next.screenshot({ path: screenshot_name+'_'+width+height+'_'+utils.between(0,10000)+'.png', type: 'png' });

       }
      }
}


const waitTillHTMLRendered = async (page, timeout = PAGE_LOAD_TIMEOUT) => {
  const checkDurationMsecs = 1000;
  const maxChecks = timeout / checkDurationMsecs;
  let lastHTMLSize = 0;
  let checkCounts = 1;
  let countStableSizeIterations = 0;
  const minStableSizeIterations = 3;

  while(checkCounts++ <= maxChecks){
    let html = await page.content();
    let currentHTMLSize = html.length;

    // let bodyHTMLSize = await page.evaluate(() => document.body.innerHTML.length);

    // console.log('last: ', lastHTMLSize, ' <> curr: ', currentHTMLSize, " body html size: ", bodyHTMLSize);

    if(lastHTMLSize != 0 && currentHTMLSize == lastHTMLSize)
      countStableSizeIterations++;
    else
      countStableSizeIterations = 0; //reset the counter

    if(countStableSizeIterations >= minStableSizeIterations) {
      console.log("Page rendered fully..");
      break;
    }

    lastHTMLSize = currentHTMLSize;
    await page.waitForTimeout(checkDurationMsecs);
  }
};





async function load_page(url,id,wait_time,home_dir,width,height,agent_name){
  const filtered_domains = new Set()
  filtered_domains.add("www.google.com")
  filtered_domains.add("www.yahoo.com")
  filtered_domains.add("www.gearbest.com")
  filtered_domains.add("everything.wiki")
  filtered_domains.add("promo.worldofwarships.com")
  filtered_domains.add("magic.wizards.com")
  filtered_domains.add("bongacams.com")
  filtered_domains.add("mbest.aliexpress.com")
  filtered_domains.add("news.apple.com")
  filtered_domains.add("www.ziamond.com")
  filtered_domains.add("worldoftanks.com")
  filtered_domains.add("na.wargaming.net")
  filtered_domains.add("www.venus.com")
  filtered_domains.add("everseal.com")
  filtered_domains.add("www.microsoft.com")
  filtered_domains.add("cherry.tv")
  filtered_domains.add("careers.integritystaffing.com")
  filtered_domains.add("www.bing.com")
  filtered_domains.add("mx.gearbest.com")
  filtered_domains.add("chromewebdata")
  filtered_domains.add("us.norton.com")
  filtered_domains.add("www.bovada.lv")

  var visited_URLs =new Set()
  const puppeteer = require('puppeteer-extra')
  const StealthPlugin = require('puppeteer-extra-plugin-stealth')
  puppeteer.use(StealthPlugin())
  var count = 0

  //  const device_width = config.USER_AGENTS[agent_name]["device_size"][0]
  //  const device_height = config.USER_AGENTS[agent_name]["device_size"][1]
   const args = [
    // '--no-sandbox',
    // '--disable-setuid-sandbox',
    '--disable-infobars',
    // '--window-position=0,0',
    '--ignore-certifcate-errors',
    '--ignore-certifcate-errors-spki-list',
    "--disable-web-security",
    "--allow-running-insecure-content",
    "--disable-popup-blocking",
    '--disable-dev-shm-usage',
    '--disable-gpu',
    `--window-size=${ width },${ height }`,
    `--user-agent=${ config.USER_AGENTS[agent_name]["user_agent"] }`
    // '--disable-background-timer-throttling',
    // '--disable-backgrounding-occluded-windows',
    // '--disable-renderer-backgrounding'
   ];
   const options = {
        headless: true,
        args,
        executablePath:home_dir+'chromium/src/out/Irfan/chrome',
        ignoreHTTPSErrors: true,
        // userDataDir:home_dir+'chrome_user/',


   };
    await puppeteer.launch(options).then(async browser =>
     {

        // url_tab is https://123moviesprime.com/123movies/
        // url is https://www1.123movies.cafe/123movies/


    try{

       var the_interval = wait_time *1000 //in milliseconds

    //    browser.on('targetcreated', async target => {

    //     if (target.type() == 'page') {
    //       var page = await target.page()
    //       var screenshot_name=logs_dir+Date.now()

    //       page.once('networkidle2',  async function(){

    //       await page.addScriptTag({path: 'get_clickable_elements.js'});
    //       var [elems, imgs] = await page.evaluate(()=> getElementData())

    //       const elem_coords =await filter_elements(elems, imgs,width,height)
    //       console.log("elem coords in targetcreated: "+elem_coords)
    //       console.log("image name:"+screenshot_name)
    //       await resizeandTakeScreenshot(screenshot_name,agent_name,page)

    //       var url_tab= page.url()
    //       console.log("url_tab is "+url_tab)
    //       console.log("url is "+url)
    //       if(url_tab==url){
    //           visited_URLs.add(url_tab)
    //           console.log("url is "+url_tab)

            //   for (const i in elem_coords){
            //       console.log('here')
            //       await page.mouse.move(elem_coords[i][0], elem_coords[i][1])
            //       await page.waitForTimeout(500)
            //       await page.mouse.down({button : "middle"})
            //       await page.waitForTimeout(150)
            //       await page.mouse.up({button : "middle"})
            //       await page.waitForTimeout(AFTER_CLICK_WAIT)
            //     }


            // }})


          // console.log((await browser.pages()).length)

          // //Intercept and block requests
          //  await p.setRequestInterception(true)
          //  // Log all the requests made by the page
          //  p.on('request', (request) => {
          //    console.log('>>', request.method(), request.url())
          //    request.continue()
          //  })
          //  // Log all the responses
          //  p.on('response', (response) => {
          //    console.log('<<', response.status(), response.url())
          //  })

          // await page.waitForTimeout(3000)
          // console.log("target created ")
          // const url_now=await page.waitForTimeoutNavigation('networkidle2', timeout=PAGE_LOAD_TIMEOUT)

          // console.log(url)
          // const url_now=await page.url()


          // const url_now = await Promise.all([
          //   page.waitForTimeoutNavigation('networkidle2', timeout=PAGE_LOAD_TIMEOUT),
          //   page.url(),
          // ]);
          // console.log(url_now)

          // if(url_now==url){
          //   console.log("here")
          //   console.log(url)
          // }



    // }})537b


      var screenshot_name=logs_dir+Date.now()

      browser.on('targetcreated', async function(target) {

        if(target._targetInfo.type=='page') {


            var page = await target.page()
            page.setDefaultTimeout(0)
            page.on('load',  async function(){

                var url_tab= await page.url()
                console.log(url_tab)
                console.log("herehereherehere")

                var x=0
                while(await page.url()=='about:blank'){


                    if (x==3){
                      await page.close()
                      return

                    }
                    await page.waitForTimeout(2000)
                    x=x+1

                }

                await waitTillHTMLRendered(page)
                // try {
                //     await page.waitForNavigation({
                //     waitUntil: 'networkidle2',
                //     timeout:15000
                //   });


                //   }
                //   catch (e) {
                //      if(e.name='TimeoutError'){

                //           console.log('timeout happened stopping loading the page5: ',url_tab);
                //           // await page.content()

                //         //   await page.evaluate(() => window.stop());
                //           // await page._client.send("Page.stopLoading");

                //         // if(page.url()!=url){
                //         //     await resizeandTakeScreenshot(screenshot_name+'_'+Date.now(),agent_name,page)
                //         //     await page.close()
                //         //     return

                //         // }

                //         }else{
                //           console.log(e)
                //           console.log("2")
                //         //   await resizeandTakeScreenshot("error2",agent_name,page_next)
                //         //   await page.close()
                //         //   return
                //         }

                //   }

                try{
                    await page.addScriptTag({path: 'get_clickable_elements.js'})

                   }catch(e){
                     console.log("error in  target created addScriptTag: "+e)
                    //  await resizeandTakeScreenshot(screenshot_name+'_'+Date.now(),agent_name,page)
                    //  return

                   }
                var [elems, imgs] = await page.evaluate(()=> {
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
                            var elem = elementDimensions(element, wHeight, wWidth);
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
                    var elem = elementDimensions(element, wHeight, wWidth);
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


                    // //Tries to retain return elements with unique sizes, and unique mid-points
                    // //On some pages there are very close click-points that don't do anything different.
                    // //Hence we try to filter out elements that have spatially close click points.

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
                    return getElementData()})

                const elem_coords =await filter_elements(elems, imgs,width,height)



                url_tab=await page.url()

                // console.log("url is2 "+url_tab)

                if(visited_URLs.length==0){
                    url_tab=await page.url()
                    console.log("landing url_tab is "+url_tab)
                    visited_URLs.add(url_tab)
                    console.log("url is "+url_tab)
                    console.log("elem coords in targetcreated: "+elem_coords)
                    for (const i in elem_coords){



                        while((await browser.pages()).length>5){ //if there is so much tab accumulated, the browser would crash wait a little bit
                          await page.waitForTimeout(90000)
                        }
                        while(await page.url()!=url_tab){
                          // try {
                              // await page.goto(url , { waitUntil: 'load', timeout: PAGE_LOAD_TIMEOUT});
                              await page.goto(url , { waitUntil: 'load'});
                              await waitTillHTMLRendered(page)
                            // } catch (e) {
                            //    if(e.name='TimeoutError'){

                            //         console.log('timeout happened stopping loading the page8');
                            //         // await page._client.send("Page.stopLoading");

                            //     }else{
                            //         console.log(e)
                            //         // throw Error (e)
                            //       }

                            //     }

                      }
                      console.log("now i is:"+i+" and url is:"+await page.url())
                      console.log("image name:"+screenshot_name+'landing'+i)
                      await resizeandTakeScreenshot(screenshot_name+'landing'+i,agent_name,page)
                        try{
                          await page.mouse.move(elem_coords[i][0], elem_coords[i][1])
                          // await page.waitForTimeout(500)
                          await page.mouse.down({button : "middle"})
                          // await page.waitForTimeout(150)
                          await page.mouse.up({button : "middle"})
                          await page.waitForTimeout(AFTER_CLICK_WAIT)
                          // await page.bringToFront();

                         }catch(e){
                           console.log("error mouse: "+e)
                           console.log("url is on error:"+await page.url())
                          //  await resizeandTakeScreenshot(screenshot_name+'_'+Date.now(),agent_name,page)
                          //  return

                         }

                        var url_tab2= await page.url()
                        if(url_tab2!=url_tab){
                            visited_URLs.add(url_tab2)
                            await resizeandTakeScreenshot(screenshot_name+'landingNEXT_'+i,agent_name,page)

                            // try {
                            // await page.goBack({ waitUntil: 'load'})
                            // await waitTillHTMLRendered(page)
                              // } catch (e) {
                              //    if(e.name='TimeoutError'){

                              //         console.log('timeout happened stopping loading the page6: '+url_tab2);


                              //       //   await page.evaluate(() => window.stop());
                              //       //   await page._client.send("Page.stopLoading");

                              //       }else{
                              //         console.log(e)

                              //         await resizeandTakeScreenshot("error12",agent_name,page)
                              //         // await page.close()


                              //       }

                              // }



                        }




               }
                    console.log("closing the first tab")
                    console.log(visited_URLs)
                    await page.close()
                    return
                }else{
                    var url_tab3= await page.url()
                    console.log("not in main page:"+url_tab3)
                    // await page.close()
                    if(utils.hasVisited(visited_URLs,url_tab3) || utils.hasVisited(filtered_domains,utils.canonical_url(url_tab3))){
                        console.log("the url in the new tab has been visited before or filtered closing...",url_tab3)
                        await page.close()
                        return
                    }else{
                        visited_URLs.add(url_tab3)
                        console.log(visited_URLs)
                        console.log(url_tab3)
                        await resizeandTakeScreenshot(screenshot_name+'_'+Date.now(),agent_name,page)
                        await page.close()
                        return
                    }

                }

            })




            }})


            // page.on('load',  async function(){
            //     console.log("here123123")
            //    await page.addScriptTag({path: 'get_clickable_elements.js'});
            //    var [elems, imgs] = await page.evaluate(()=> getElementData())

            //    const elem_coords =await filter_elements(elems, imgs,width,height)
            //    console.log("elem coords in targetcreated: "+elem_coords)


            //    var url_tab= page.url()

            //    console.log("url is "+url)
            //    if(url_tab==url || visited_URLs.length==0){
            //        console.log("landing url_tab is "+url_tab)
            //        visited_URLs.add(url_tab)
            //        console.log("image name:"+screenshot_name+'landing')
            //        await resizeandTakeScreenshot(screenshot_name+'landing',agent_name,page)
            //        console.log("url is "+url_tab)

            //        for (const i in elem_coords){

        //    var visit_count=0
        //    while(true){
        //     try{
        //       await page.goBack({ waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT})
        //       console.log('goBack successfully' , visit_count);
        //       break;

        //     }catch(e){
        //       visit_count=visit_count+1
        //       if(e.name='TimeoutError' && visit_count!=3){
        //         console.log('visit count' , visit_count);
        //         console.log('ERROR reloading, reloading again');
        //         await page.reload(url,{ waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT});
        //         continue;
        //       }else{
        //         throw Error (e)
        //       }
        //     }
        //   }

        //    console.log('visit count after: ',visit_count)



                //       await resizeandTakeScreenshot(screenshot_name+'landing'+i,agent_name,page)
                //       await page.mouse.move(elem_coords[i][0], elem_coords[i][1])
                //       await page.waitForTimeout(500)
                //       await page.mouse.down({button : "middle"})
                //       await page.waitForTimeout(150)
                //       await page.mouse.up({button : "middle"})
                //       await page.waitForTimeout(AFTER_CLICK_WAIT)
                //   }

    //             await page.close()
    //          }else{
    //           console.log("not in main page")
    //           console.log("new tab url_tab is "+url_tab)
    //           console.log(visited_URLs)
    //          }


    //     })
    // }

    // })


      const page = await browser.newPage(); //open new tab
     (await browser.pages())[0].close(); //close first one, to overcome the bug in stealth library mentioned in
      //https://github.com/berstend/puppeteer-extra/issues/88

      var is_mobile= config.USER_AGENTS[agent_name]["mobile"]


       await page.setViewport({ width:  width,
                                height: height ,
                                deviceScaleFactor:config.USER_AGENTS[agent_name]["device_scale_factor"],
                                isMobile:config.USER_AGENTS[agent_name]["mobile"],
                                hasTouch:config.USER_AGENTS[agent_name]["mobile"],
                                isLandscape: config.USER_AGENTS[agent_name]["isLandscape"]})

       var wait_interval = 5000
       count=0

       // checks if the timeout has exceeded every few seconds
       var trigger = await setInterval(async function()
       {
           // close the browser if the run exfceeds timeout interval
           if (count >= the_interval )
           {
             console.log(new Date(Date.now()).toLocaleString())

             await browser.close();
             console.log('visit ended')
             clearInterval(trigger);
             await process_ended(id)
             return
           }
           count = count+wait_interval
       }, wait_interval);
       try{

        console.log('visiting page')

        // try {
          await page.goto(url , { waitUntil: 'load', timeout: PAGE_LOAD_TIMEOUT});
          await waitTillHTMLRendered(page)
        // } catch (e) {
        //    if(e.name='TimeoutError'){

        //         console.log('timeout happened stopping loading the page1');
        //         // await page._client.send("Page.stopLoading");

        //     }else{
        //         console.log(e)
        //         // throw Error (e)
        //       }

        //     }



            // finally{
        //     await page.goto("https://123moviesprime.com/tenet-2020/" , { waitUntil: 'load', timeout: PAGE_LOAD_TIMEOUT});
        // }


        // await page.addScriptTag({path: 'get_clickable_elements.js'});
        // var [elems, imgs] = await page.evaluate(()=> getElementData())

        // const elem_coords2 =await filter_elements(elems, imgs,width,height)
        // console.log(elem_coords2)
        // await page.waitForTimeout(3000)





          // const [link] = await page.$x("//a[contains(., 'https://bot.sannysoft.com/')]"); // returns an array, as the first element will be used it can be destructured
          // //const [link] = await page.$x("//a[contains(., 'Check for yourself/')]"); // returns an array, as the first element will be used it can be destructured
          // // Check for yourself
          // await link.click({button : "left"})
          // await page.waitForTimeout(AFTER_CLICK_WAIT)

          // const page_next =(await browser.pages())[0]
          // await page_next.setViewport({ width, height })
          // await page.waitForTimeout(WAIT_AFTER_RESIZE)

          // await page_next.screenshot({ path: logs_dir+Date.now()+'_page_sametabnotstealthextra.png', type: 'png' });

          // browser.close()

          // await page.screenshot({ path: logs_dir+Date.now()+'.png', type: 'png' });

        //   var tabCountClicked=(await browser.pages()).length
        //   console.log("before checking first tab:",tabCountClicked)

        //   var url_next= page.url()
        //   console.log("kanonik: ",utils.canonical_url(url_next))
        //   if(url_next!=url_first_tab){
        //     if(!(utils.hasVisited(visited_URLs,url_next) || utils.hasVisited(filtered_domains,utils.canonical_url(url_next)) )){
        //       visited_URLs.add(url_next)
        //       console.log(url_next)
        //       console.log("new page opened in the same tab.Visited URLs are not the same")
        //       var screenshot_name2=screenshot_name+'_sameTAB_coor#_'+i+'_res_'
        //       await resizeandTakeScreenshot(screenshot_name2,agent_name,page)
        //       console.log("image name:"+screenshot_name2)


        //       }else{
        //         console.log("this url has been visited before or filtered")
        //         console.log(visited_URLs)
        //         console.log(url_next)

        //       }
        //       console.log("going back back")

        //       try {
        //         await page.goBack({ waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT})
        //       } catch (e) {
        //          if(e.name='TimeoutError'){

        //               console.log('timeout happened stopping loading the page5');


        //               // await page.evaluate(() => window.stop());
        //               await page._client.send("Page.stopLoading");

        //             }else{
        //               console.log(e)
        //               console.log("12")
        //               await resizeandTakeScreenshot("error12",agent_name,page_next)
        //               await page.close()


        //             }

        //       }

        //   }

        //   else{
        //        console.log("clicked. But page has not changed.")


        //   }


        //     // #More than one tabs are opening and also at the same time the page in the main tab
        //     // #changes. I am taking the screenshots of them, going back at the main tab and continue clicking
        //     tabCountClicked=(await browser.pages()).length
        //     console.log("after checking first tab:",tabCountClicked)

        //     while (tabCountClicked != tabCount){
        //         console.log("new page opened in new tab")
        //         console.log("tab_count_clicked")
        //         console.log(tabCountClicked)
        //         // tabCountClicked=(await browser.pages()).length
        //         // var visit_count=0


        //         // try {

        //       try {
        //            var page_next =(await browser.pages())[tabCountClicked-1]
        //            await page_next.waitForTimeout({
        //            waitUntil: 'networkidle2',
        //            timeout:PAGE_LOAD_TIMEOUT
        //          });

        //       } catch (e) {
        //          if(e.name='TimeoutError'){

        //               console.log('timeout happened stopping loading the page6');
        //               // await page.content()
        //               // await page_next.evaluate(() => window.stop());
        //               await page_next._client.send("Page.stopLoading");
        //         }else{
        //               console.log(e)
        //               // console.log("1")
        //               // await resizeandTakeScreenshot("error1",agent_name,page_next)
        //               tabCountClicked=tabCountClicked-1
        //               await page_next.close()
        //               continue
        //             }

        //        }
        //         // } catch (e) {
        //         //    if(e.name='TimeoutError'){

        //         //         console.log('timeout happened stopping loading the page');
        //         //         // await page.content()
        //         //         await page.evaluate(() => window.stop());

        //         //       }else{
        //         //         console.log(e)
        //         //         console.log("closing the tab because of the error")
        //         //         tabCountClicked=tabCountClicked-1
        //         //         await page_next.close()
        //         //         continue

        //         //       }

        //         // }



        //         // const page_next =(await browser.pages())[tabCountClicked-1]
        //         url_next= page_next.url()


        //         if(utils.hasVisited(visited_URLs,url_next) || utils.hasVisited(filtered_domains,utils.canonical_url(url_next))){
        //           console.log("the url in the new tab has been visited before or filtered closing...",url_next)
        //           tabCountClicked=tabCountClicked-1
        //           await page_next.close()
        //           continue
        //         }

        //         console.log(url_next)
        //         if (url_next=="about:blank"){
        //           console.log("empty tab..skipping")
        //           tabCountClicked=tabCountClicked-1
        //           await page_next.close()
        //           continue
        //         }

        //         visited_URLs.add(url_next)
        //         console.log("kanonik: ",utils.canonical_url(url_next))
        //         var screenshot_name3= screenshot_name+'_newTAB_'+(tabCountClicked-1)+'_coor#_'+i+'_'+'_res_'
        //         await resizeandTakeScreenshot(screenshot_name3,agent_name,page_next)
        //         console.log("image name:"+screenshot_name3)
        //        //continue to click on in the ad opened in the new tab

        //         visited_URLs=await clickFiveTimes(tabCountClicked,url_next,browser,page_next,agent_name,visited_URLs,is_mobile,screenshot_name,filtered_domains,PAGE_LOAD_TIMEOUT)


        //             await page_next.close()
        //             tabCountClicked=tabCountClicked-1
        //       }





        //   }


       }
       catch(err){

           console.log(err)
           await browser.close();
           console.log(new Date(Date.now()).toLocaleString())
           console.log('visit ended')
           clearInterval(trigger);
           await process_ended(id)
           return
       }

    //    console.log('page visited')
    //    console.log(new Date(Date.now()).toLocaleString())
    //    await browser.close()
    //    clearInterval(trigger);
    //    await process_ended(id)
       return


     }
     catch(e){
         console.log(e)
     }
   })
}
async function process_ended(id){
   console.log('crawl process ended :: '+id)
}

async function crawl_url(url, id,timeout,home_dir,width,height,agent_name){
   try{
     console.log('crawling started :: ' +id)
     console.log(new Date(Date.now()).toLocaleString())
     await load_page(url,id,timeout,home_dir,width,height,agent_name)
     return

   }
   catch(error){
     console.log(error)
     return
   }
}

crawl_url(url,site_id,timeout,home_dir,width,height,agent_name);





//   if (process.argv[2]) {
//    var url = process.argv[2];
//    var site_id =process.argv[3];
//    var i_count = process.argv[4];
//    var timeout = process.argv[5];
//    crawl_url(url,site_id,i_count,timeout)

//    }
// my first screenshot method for testing
// (async () => {
//      const browser = await puppeteer.launch({headless:true,executablePath:'/home/irfan/chromium/src/out/Irfan/chrome'});
//      //const browser = await puppeteer.launch({headless:false});
//      const page = await browser.newPage();
//      await page.goto('https://raddy.co.uk/');
//      page.setViewport({width: 1300,height:2000, deviceScaleFactor:1})
//      await page.screenshot({path: `screenshot${Date.now()}.png`})
//      const version = await page.browser().version();
//      console.log(version);
//      await browser.close();

//   })();
// function get_elements(el, frameIndex){
//   var tags = [];
//   var recs = [];
//   var iframe_count = 0
//   width  =Math.max(document.body.scrollWidth, document.body.offsetWidth, document.documentElement.clientWidth, document.documentElement.scrollWidth, document.documentElement.offsetWidth)
//   if(el==null) return recs;
//   var e = el.getElementsByTagName('*');
//   for (var i=0; i<e.length; i++) {
//       var rect           = e[i].getBoundingClientRect();

//       recs[i]={}
//       if (rect != undefined){
//           recs[i].right = rect.right;
//           recs[i].top = rect.top;
//           recs[i].bottom = rect.bottom;
//           recs[i].left = rect.left
//           recs[i].height = rect.height
//       }
//       recs[i].innerText  = e[i].textContent ;
//       recs[i].tag        = e[i].tagName!= undefined? e[i].tagName : '';
//       recs[i].id         = e[i].id!=null?e[i].id:'None';
//       recs[i].name       = e[i].name!=null?e[i].name:'None';
//       recs[i].type       = e[i].type ;
//       recs[i].text       = e[i].Text ;
//       recs[i].value      = e[i].value ;
//       //recs[i].left       = (e[i].clientLeft/document.documentElement.clientWidth )* width;
//       recs[i].visibility = e[i].style!= undefined ? e[i].style.visibility : 'null' ;
//       recs[i].placeholder= e[i].placeholder!=null?e[i].placeholder!=''?e[i].placeholder:'null':'null';
//       recs[i].form = 'Null'
//       recs[i].frameIndex = frameIndex
//       if (e[i].tagName =='IFRAME')
//       {

//           frame_elements = get_elements (e[i].contentDocument, iframe_count)
//           recs = recs.concat(frame_elements)
//           iframe_count = iframe_count + 1
//       }
//   }
//   return recs; }
      //  result = (() => {
      //   const allElements = Array.prototype.slice.call(document.querySelectorAll('*'));
      //   allElements.push(document);

      //   return allElements.reduce((res, element) => {
      //     const eventListeners = getEventListeners(element);
      //     const eventTypes = Object.keys(eventListeners);
      //     if (eventTypes.length !== 0) {
      //         events = {};

      //         eventTypes.forEach((eventType) => {
      //             events[eventType] = eventListeners[eventType].reduce((ev, eventListener) => {
      //                 ev.push(eventListener.listener.toString());
      //                 return ev;
      //             }, []);
      //         });

      //         res.push({
      //             node: element,
      //             events: events,
      //         });
      //     }
      //     return res;
      //   }, []);
      // })();
      // console.log('elements below');
      // console.log(result);
          //const link=await page.querySelector("#post-content > p:nth-child(5) > a")
          //const elements = await page.$x('//*[@id="navbar"]/div/div[1]/a/img')
          //await elements[0].click()
          //await link.click()
          // const [link] = await page.$x("//a[contains(., 'Check for yourself')]"); // returns an array, as the first element will be used it can be destructured
          // await link.click({button : "middle"})

          // await Promise.all([

          // ]);
          // await page.mouse.click(elem_coords[1][0] , elem_coords[1][1], {button: 'left'})
          // await page.click(document.querySelector("#post-content > p:nth-child(5) > a").innerText,{button : "middle"})
          // await page.waitForTimeout(AFTER_CLICK_WAIT)

          // const page_next =(await browser.pages())[1]
          // await page_next.bringToFront();
          // await page_next.screenshot({ path: logs_dir+Date.now()+'_page_newtabnotstealth.png', type: 'png' });
          // await puppeteer.launch({ headless:true,
          //   executablePath:home_dir+'chromium/src/out/Irfan/chrome',
          //    userDataDir:home_dir+'chrome_user/',
          //   args: [
          //            '--enable-features=NetworkService',
          //   //         '--no-sandbox',
          //   //         '--disable-setuid-sandbox',
          //   //         //'--window-size=${ width },${ height }',
          //            //'--start-maximized',
          //            '--ignore-certificate-errors','--disable-gpu',
          //   //         //'--disable-extensions-except='+home_dir+'app/adGuard',
          //   //         //'--load_extension = '+home_dir+'app/adGuard'
          //          ]
          //  })
// const url_1 = 'http://www.bar.foo.com/ba?a=b&c=d'
// const url_2 = 'http://www.bar.foo.com:80/bar?c=d;a=b'
// if (utils.canonical_url(url_1)==utils.canonical_url(url_2))
//     console.log(utils.canonical_url(url_1))
//     console.log(utils.canonical_url(url_2))
//     console.log ("URLs are the same")
      //     page.on("framenavigated", frame => {
      //       // const url = frame.url(); // the new url
      //             //  // Log all the requests made by the page
      //       page.on('request', (request) => {
      //           console.log('>>', request.method(), request.url())
      //           request.continue()
      //       })
      //       // Log all the responses
      //       page.on('response', (response) => {
      //           console.log('<<', response.status(), response.url())
      //       })

      //       // do something here...
      // });

          // const preloadFile = fs.readFileSync('./get_clickable_elements.js', 'utf8');
          // await page.evaluateOnNewDocument(preloadFile);
          //  const elem_coords=[]

          // const jsHandle = await page.evaluateHandle(() => {
          //   const elements = document.getElementsByTagName('h1');
          //   return elements;
          // });
          // console.log(jsHandle); // JSHandle

          // const result = await page.evaluate(els => els[0].innerHTML, jsHandle);













                      // const selected_elements = []
            // if (document.all !== undefined)
            // {
            //   var items =document.all;
            // }
            // else
            // {
            //   var items =document.getElementsByTagName("*");
            // };
            //     for (var i = 0; i < items.length; ++i) {
            //     if (items[i].textContent.includes("Check for yourself")) {

            //       selected_elements.push(items[i].textContent)

            //       // items[i].click({button:'middle'});
            //     }

            // }
            // return selected_elements
              // return matchingElement





              // async function resizeandTakeScreenshot(screenshot_name,agent_name,page_next){
//   var wait_interval1 = 6000
//   var count1=0
//   var the_interval1= 120000

//   // checks if the timeout has exceeded every few seconds
//   var trigger1 = await setInterval(async function()
//   {
//       // close the browser if the run exfceeds timeout interval
//       if (count1 >= the_interval1 )
//       {


//        //  await browser.close();
//         console.log("INTERVAL INTERVAL")
//         clearInterval(trigger1);


//         console.log("here12")

//         return false
//       }
//       count1 = count1+wait_interval1
//   }, wait_interval1)

//   if(!trigger){
//     console.log("INTERVAL REACHED")
//     return false
//   }


//   console.log("here11")

//   if(config.USER_AGENTS[agent_name]["mobile"]){
//       var ss_name=screenshot_name+'_'+width+height+'_mobi_'+utils.between(0,10000)+'.png'
//       width=config.USER_AGENTS[agent_name]["window_size_cmd"][0][0]
//       height=config.USER_AGENTS[agent_name]["window_size_cmd"][0][1]
//       console.log("here111")
//       await page_next.screenshot({ path: ss_name, type: 'png' });
//       console.log("here112")
//       clearInterval(trigger1);
//       console.log("here113")
//       trigger1=0
//       console.log("here114")
//       return true
//    }else{

//      const rand_viewports=utils.getRandViewports(config.USER_AGENTS[agent_name]["window_size_cmd"])

//      console.log("rand_viewports are:"+rand_viewports)

//      for (const q in rand_viewports){
//        width=rand_viewports[q][0]
//        height=rand_viewports[q][1]
//        var ss_name=screenshot_name+'_'+width+height+'_'+utils.between(0,10000)+'.png'
//        await page_next.setViewport({ width: width,
//                               height:height
//         })
//          await page_next.waitForTimeout(WAIT_AFTER_RESIZE)


//          console.log("just before taking screenshot desktop")
//          await page_next.screenshot({ path:ss_name , type: 'png' });
//          console.log("just after taking screenshot desktop")
//     }
//     clearInterval(trigger1);
//     trigger1=0
//     return true
//    }
// }






          // console.log(elem_coords)
          // console.log("-----------------")



          // console.log(select_elements)

          // for(const i in select_elements){
          //   await page.mouse.move(select_elements[i][0], select_elements[i][1])
          //   await page.waitForTimeout(500)
          //   await page.mouse.down()

          //   await page.waitForTimeout(150)
          //   await page.mouse.up()

          //   await page.waitForTimeout(5000)
          //   await page.goBack()

          // }
          // return





          // await page.mouse.move(select_elements[0][0], select_elements[0][1])
          // await page.waitForTimeout(500)
          // await page.mouse.down({button : "middle"})

          // await page.waitForTimeout(150)
          // await page.mouse.up({button : "middle"})

          // await page.waitForTimeout(5000)

          // await page.mouse.move(select_elements[1][0], select_elements[1][1])
          // await page.waitForTimeout(500)
          // await page.mouse.down({button : "middle"})

          // await page.waitForTimeout(150)
          // await page.mouse.up({button : "middle"})
          // await page.waitForTimeout(5000)

          // // await page_next.screenshot({ path: logs_dir+Date.now()+'_page_sametabnotstealthextra.png', type: 'png' });

          // return

         //  TEST ENDED HERE






