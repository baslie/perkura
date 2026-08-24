import asyncio
import sys
from playwright.async_api import async_playwright

SEL = sys.argv[1] if len(sys.argv) > 1 else ".about-hero"
OUT = sys.argv[2] if len(sys.argv) > 2 else "hero"
WIDTH = int(sys.argv[3]) if len(sys.argv) > 3 else 1920


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": WIDTH, "height": 1053})
        await pg.goto("http://localhost:3000/about.html")
        await pg.wait_for_timeout(1200)
        await pg.evaluate("(s) => document.querySelector(s).scrollIntoView()", SEL)
        await pg.wait_for_timeout(700)
        el = pg.locator(SEL)
        box = await el.bounding_box()
        print(SEL, {k: round(v) for k, v in box.items()})
        await el.screenshot(path="../_ref/%s.png" % OUT)
        print("страница:", await pg.evaluate("document.documentElement.scrollHeight"))
        await b.close()


asyncio.run(main())
