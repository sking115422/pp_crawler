#! /usr/bin/python
###########################################################################
# Copyright (C) 2018 Phani Vadrevu                                        #
# phani@cs.uno.edu                                                        #
#                                                                         #
# Distributed under the GNU Public License                                #
# http://www.gnu.org/licenses/gpl.txt                                     #
#                                                                         #
# This program is free software; you can redistribute it and/or modify    #
# it under the terms of the GNU General Public License as published by    #
# the Free Software Foundation; either version 2 of the License, or       #
# (at your option) any later version.                                     #
#                                                                         #
###########################################################################

from math import floor
import time
from PIL import Image, ImageDraw
import socket
import random
import subprocess
# This can be used for giving unique names to files, directories etc.
# Strangely, time.clock() didn't have micro-second precision.
# Also, we don't want clock to reset for every process. So, time.time() is more apt


from config import MAIN_LOG_PATH, DOWNLOADS_DIR, RAW_DOWNLOADS_DIR
from config import MIN_CHROME_DEBUG_PORT, MAX_CHROME_DEBUG_PORT
from urllib.parse import urlparse, parse_qsl, unquote_plus
from w3lib.url import url_query_cleaner
from url_normalize import url_normalize



def us_timestamp_str():
    return str(int(time.time() * 1000000))

# Round x to nearest multiple of 'base'
def any_round(x, base=50):
    return base * floor(x / base)

def mark_coordinates(coords, fname):
    im = Image.open(fname)
    draw = ImageDraw.Draw(im)
    draw.ellipse((coords[0] - 10, coords[1] - 10,
                coords[0] + 10, coords[1] + 10),
                fill = 'red',
                outline = 'red')
    im.save(fname)


def is_port_free(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    status = False
    try:
        s.bind(("127.0.0.1", port))
    except socket.error as e:
        pass
    else:
        status = True
    s.close()
    return status

def fetch_random_free_port():
    while True:
        candidate_port = random.randint(MIN_CHROME_DEBUG_PORT, MAX_CHROME_DEBUG_PORT)
        if is_port_free(candidate_port):
            return candidate_port





# def compare_urls(url1,url2):
#     #'http://www.example.com'
#     url1_parsed=urlparse(url1)
#     #ParseResult(scheme='http', netloc='www.example.com', path='', params='', query='', fragment='')
#     url2_parsed=urlparse(url2)
#     #ParseResult(scheme='http', netloc='example.com', path='', params='', query='', fragment='')
#     print(url1_parsed.netloc)
#     print(url2_parsed.netloc)
#     if url1_parsed==url2_parsed.netloc:
#         return True
#     else:
#         return False



def canonical_url(u):
    u = url_normalize(u)
    u = url_query_cleaner(u,parameterlist = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'],remove=True)

    # if u.startswith("http://"):
    #     u = u[7:]
    # if u.startswith("https://"):
    #     u = u[8:]
    # if u.startswith("www."):
    #     u = u[4:]
    # if u.endswith("/"):
    #     u = u[:-1]
    # if u.endswith("/"):
    #     u = u[:-1]

    url_parsed=urlparse(u)

    print(url_parsed.netloc)

    return url_parsed.netloc