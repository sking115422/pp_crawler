capture_screenshots.py : This is the first crawler script I created. Initially, I decided to use the pyppeteer python library. After creating the code and intensive tests, I saw that it was very slow, there were a lot of unexplained browser crashes, and the library did not seem to be updated so much, and the community for that library was very small. By the way, I am doing those tests on ad-intensive websites. In normal, benign websites, the code and the other codes written in nodejs and playwright library generally work great. However, those websites are not the ones we want to crawl. I decided not to use that python library

capture_screenshots_pw.py : I further searched python libraries which were well-maintained and less buggy. I also saw other problems that I could not solve with that library. I found the playwright puppeteer library. After I was getting used to the library and creating many functionalities, I saw that stealth functionality was not working correctly. For example, the first tab was stealth, and the other tabs do not have that functionality. That problem is also mentioned in forum threads. The stealth plugin was not browser-wide. I decided not to use it.

capture_screenshots_pw2.py : I used that playwright script to test the stealth plugin.

capture_screenshots_target.js: After I saw the puppeteer nodejs library working very fast, the number of unexpected browser crashes was very low, the community support was very big, I started using it. In that script, I decided to handle newly opened tabs by targetcreated event, which could have made the code less complicated, easy to maintain, more asynchronous, and fast. However, After intensive testing, I got unexpected behaviors and errors like targetcreated event firing many times for a newly created tab and browser crashing when a lot of tabs are triggered on the ad-intensive webpage. Even created some functionalities not to process many tabs at the same time, I was unable to prevent unexpected browser crashes. I decided to use nodejs puppeteer without targetcreated event mechanism

get_clickable_elements.py: This Dr. Phani’s code from theSEACMA paper, to get coordinates of the clickable elements.

Utils.py: Contains helper functions used.


