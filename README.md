# Faction Command Center

Type a command, get your faction's info. Works in **Tampermonkey (desktop)** and **Torn PDA (mobile)**.
Made by [IvyLara \[4393901\]](https://www.torn.com/profiles.php?XID=4393901).

![status](https://img.shields.io/badge/torn-userscript-c9a74a)

## What it does

A small draggable panel on torn.com. Type a command (or tap a bookmark) and it shows the answer, and can also post it to your own Discord channel.

| Command | What you get |
|---|---|
| `info` `members` `online` `levels` | Faction overview, activity, who is online, level spread |
| `hospital` `travel` `inactive [days]` `new [days]` `find <name>` | Member lists |
| `chain` `war` `territory` | Chain timer, latest ranked war, territory |
| `vault` | Vault balance: faction-only, members, and total |
| `armoury` `stock <item>` | Armoury totals and stock of one item |
| `oc` `news` `attacks` | Organized crimes, faction news, recent attacks |
| `warpay [amount] [hits\|score] [fac=20] [pl=80]` | War payouts: set how much the faction keeps and how much players share |
| `report` `usage` `help` | Combined report, API calls used, list of commands |

**Alerts to your Discord webhook** (only while Torn is open): low chain timer, ranked war starting / lead flips / close score / war over, OC ready or empty slots, low armoury stock, and a daily report.

Extras: bookmarks (quick buttons for commands or links), accent colour, opacity, text size, hotkey, settings export/import (desktop).

## Privacy

- Your API key and Discord webhook are stored **only on your device** (inside Tampermonkey / Torn PDA).
- The key is sent **only to api.torn.com**. Results go **only to the webhook you enter**.
- There is no server, no tracking, no analytics, nothing is collected.
- The script only **reads** data. It never performs actions in your account.
- Tip: create a key with the lowest access level that still works. If a command says the access level is too low, raise it.

## Install (desktop)

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Open this link, then press **Install**:
   `https://raw.githubusercontent.com/YOUR-GITHUB-USERNAME/faction-command-center/main/faction-command-center.user.js`
3. Go to torn.com. Click the gold shield at the bottom-left.
4. Open ⚙ → **setup**, paste your API key (and optionally a Discord webhook), press **save**.

Updates arrive automatically through Tampermonkey.

## Install (Torn PDA)

Menu names can differ slightly between app versions.

1. Open the link from step 2 above in any browser, select all, and **copy** the whole script.
2. In Torn PDA open **Settings → Advanced Browser Settings → Userscripts** and add a new script.
3. Name it `Faction Command Center`, paste the code, and make sure it is enabled.
4. Reload any Torn page. The gold shield appears at the bottom-left.
5. The script should use your Torn PDA API key automatically. If not, paste a key in ⚙ → setup.

PDA does not auto-update this script. To update, repeat steps 1 to 3.

## Get a Discord webhook (optional)

In Discord: channel settings → **Integrations** → **Webhooks** → **New Webhook** → **Copy Webhook URL**. Paste it in ⚙ → setup, then press **test webhook**.

## Troubleshooting

| Message | What to do |
|---|---|
| "access level is too low" (error 16) | Make a key with a higher access level, from a member who can see that faction data |
| "can't see that faction data" (error 7) | The key owner's faction position doesn't allow it |
| Too many requests | Wait a minute. The script stops itself at 90 calls a minute |
| Nothing happens on PDA | Check the script is enabled and reload the page |
| Alerts don't arrive | Alerts only run while Torn is open and a webhook is saved |

## Support

If the script helps your faction, you can say thanks with the **SUPPORT ME** button in the panel.

## License

Free to use. Please don't re-upload or edit and redistribute it, see [LICENSE](LICENSE).
