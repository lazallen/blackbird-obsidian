#!/usr/bin/env python3
"""
Live integration test for the Blackbird plugin via Chrome DevTools Protocol.
Requires Obsidian to be running with --remote-debugging-port=9222.

Usage:
  open -a Obsidian --args --remote-debugging-port=9222
  python3 scripts/test-live.py
"""
import json, asyncio, sys

PAGE_ID_URL = "http://localhost:9222/json/list"

async def get_obsidian_page_id():
    import urllib.request
    data = json.loads(urllib.request.urlopen(PAGE_ID_URL, timeout=3).read())
    for page in data:
        if page.get("type") == "page" and "obsidian.md" in page.get("url", ""):
            return page["id"]
    return None

async def cdp_eval(page_id, expression):
    import websockets
    async with websockets.connect(f"ws://localhost:9222/devtools/page/{page_id}") as ws:
        await ws.send(json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {"expression": expression, "returnByValue": True, "awaitPromise": True}
        }))
        while True:
            resp = json.loads(await ws.recv())
            if resp.get("id") == 1:
                result = resp.get("result", {}).get("result", {})
                if result.get("type") == "string":
                    return json.loads(result["value"])
                return result

async def main():
    page_id = await get_obsidian_page_id()
    if not page_id:
        print("ERROR: Obsidian not found. Launch with: open -a Obsidian --args --remote-debugging-port=9222")
        sys.exit(1)

    print(f"Connected to Obsidian page: {page_id[:8]}...")

    # --- Test 1: Plugin loaded ---
    state = await cdp_eval(page_id, """
    JSON.stringify({
      loaded: !!app.plugins.plugins['blackbird'],
      commands: Object.keys(app.commands.commands).filter(c => c.includes('blackbird')),
      dashLeaves: app.workspace.getLeavesOfType('blackbird-dashboard').length,
    })
    """)
    assert state["loaded"], "Blackbird plugin not loaded!"
    assert any("open-blackbird-dashboard" in c for c in state["commands"]), "Dashboard command missing!"
    print(f"✓ Plugin loaded — {len(state['commands'])} commands registered")

    # --- Test 2: getDashboardItems returns tasks ---
    items_result = await cdp_eval(page_id, """
    (async () => {
      const bb = app.plugins.plugins['blackbird'];
      const items = await bb._adapter.getDashboardItems(app);
      return JSON.stringify({
        total: items.length,
        pinned: items.filter(i => i.state === 'pinned').length,
        next: items.filter(i => i.state === 'next').length,
        sessions: items.filter(i => i.state === 'note-session').length,
        titles: items.map(i => i.title),
      });
    })()
    """)
    print(f"✓ getDashboardItems: {items_result['total']} items "
          f"(pinned={items_result['pinned']}, next={items_result['next']}, sessions={items_result['sessions']})")
    for t in items_result['titles']:
        print(f"  - {t}")

    # --- Test 3: Dashboard DOM is rendered ---
    dom_result = await cdp_eval(page_id, """
    JSON.stringify({
      dashLeaves: app.workspace.getLeavesOfType('blackbird-dashboard').length,
      hasSections: !!document.querySelector('.bb-dashboard-section'),
      hasItems: document.querySelectorAll('.bb-dashboard-item').length,
      sectionTitles: [...document.querySelectorAll('.bb-dashboard-section-title')].map(el => el.textContent),
    })
    """)
    assert dom_result["hasSections"], "Dashboard sections not found in DOM!"
    print(f"✓ Dashboard DOM: {dom_result['hasItems']} items rendered")
    print(f"  Sections: {dom_result['sectionTitles']}")

    print("\n✅ All live tests passed!")

asyncio.run(main())
