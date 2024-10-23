'use strict';
var IMG_PREFERENCE_THRESHOLD = 900
var SHORT_PAUSE = 5

// import utils from './utils';


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








// module.exports = {


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








// }


// module.exports.getElementData = getElementData;




