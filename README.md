<h1 align="center">Faction Command Center</h1>

<p align="center">
Type a command, get your faction's info.<br>
Works in <b>Tampermonkey (desktop)</b> and <b>Torn PDA (mobile)</b>.<br>
Made by <a href="https://www.torn.com/profiles.php?XID=4393901">IvyLara [4393901]</a>
</p>

<p align="center">
  <a href="https://raw.githubusercontent.com/Ivylara198/faction-command-center/main/faction-command-center.user.js"><img alt="Install on desktop" src="https://img.shields.io/badge/INSTALL-Desktop_(Tampermonkey)-c9a74a?style=for-the-badge&labelColor=141414"></a>
  <a href="#install-torn-pda"><img alt="Install on Torn PDA" src="https://img.shields.io/badge/INSTALL-Torn_PDA_(Mobile)-c9a74a?style=for-the-badge&labelColor=141414"></a>
</p>
<p align="center">
  <a href="https://www.tampermonkey.net/"><img alt="Get Tampermonkey" src="https://img.shields.io/badge/STEP_1-Get_Tampermonkey-2b2b2b?style=for-the-badge&labelColor=141414"></a>
  <a href="https://www.torn.com/profiles.php?XID=4393901"><img alt="Support me" src="https://img.shields.io/badge/SUPPORT_ME-IvyLara_%5B4393901%5D-ff3d8b?style=for-the-badge&labelColor=141414"></a>
</p>

---

## Quick start

| I use | Do this |
|---|---|
| **A computer** | 1. [**Get Tampermonkey**](https://www.tampermonkey.net/)  2. [**Install the script**](https://raw.githubusercontent.com/Ivylara198/faction-command-center/main/faction-command-center.user.js) and press **Install**  3. Open torn.com and click the gold shield at the bottom-left |
| **Torn PDA (phone)** | Follow [**Install (Torn PDA)**](#install-torn-pda) below |

Then open the ⚙ settings in the panel, paste your API key, press **save**. That's it.

---

## What it does

A small draggable panel on torn.com. Type a command (or tap a bookmark) and it shows the answer. It can also post results to your own Discord channel.

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

**Alerts to your Discord webhook** (only while Torn is open): low chain timer, ranked war starting / lead changes / close score / war over, OC ready or empty slots, low armoury stock, and a daily report.

Extras: bookmarks (quick buttons for commands or links), accent colour, opacity, text size, hotkey, settings export/import (desktop only).

---

## Privacy

- Your API key and Discord webhook are stored **only on your device** (inside Tampermonkey or Torn PDA).
- The key is sent **only to api.torn.com**. Results go **only to the webhook you enter**.
- There is no server, no tracking, no analytics. Nothing is collected.
- The script only **reads** data. It never performs actions in your account.
- Tip: create a key with the lowest access level that still works. If a command says the access level is too low, raise it.

---

## Install (desktop)

<p>
  <a href="https://www.tampermonkey.net/"><img alt="Get Tampermonkey" src="https://img.shields.io/badge/1._GET-Tampermonkey-2b2b2b?style=for-the-badge&labelColor=141414"></a>
  <a href="https://raw.githubusercontent.com/Ivylara198/faction-command-center/main/faction-command-center.user.js"><img alt="Install script" src="https://img.shields.io/badge/2._INSTALL-Faction_Command_Center-c9a74a?style=for-the-badge&labelColor=141414"></a>
</p>

1. Install **Tampermonkey** for your browser (button 1).
2. Press **button 2**. Tampermonkey opens an install page, press **Install**.
3. Go to torn.com and click the gold shield at the bottom-left.
4. Open ⚙ → **setup**, paste your API key (and optionally a Discord webhook), press **save**.

Updates arrive automatically through Tampermonkey.

---

## Install (Torn PDA)

<p>
  <a href="https://raw.githubusercontent.com/Ivylara198/faction-command-center/main/faction-command-center.user.js"><img alt="Open the script to copy" src="https://img.shields.io/badge/1._OPEN-Script_to_copy-c9a74a?style=for-the-badge&labelColor=141414"></a>
  <a href="https://github.com/Manuito83/torn-pda"><img alt="Get Torn PDA" src="https://img.shields.io/badge/GET-Torn_PDA_app-2b2b2b?style=for-the-badge&labelColor=141414"></a>
</p>

Menu names can differ slightly between app versions.

1. Press **button 1**, select all the text, and **copy** it.
2. In Torn PDA open **Settings → Advanced Browser Settings → Userscripts** and add a new script.
3. Name it `Faction Command Center`, paste the code, and make sure it is enabled.
4. Reload any Torn page. The gold shield appears at the bottom-left.
5. The script should use your Torn PDA API key automatically. If not, paste a key in ⚙ → setup.

PDA does not auto-update this script. To update, repeat steps 1 to 3.

---

## Get a Discord webhook (optional)

<p>
  <a href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"><img alt="Discord webhook guide" src="https://img.shields.io/badge/HELP-How_to_make_a_Discord_webhook-5865f2?style=for-the-badge&labelColor=141414"></a>
</p>

In Discord: channel settings → **Integrations** → **Webhooks** → **New Webhook** → **Copy Webhook URL**. Paste it in ⚙ → setup, then press **test webhook**.

---

## Troubleshooting

| Message | What to do |
|---|---|
| "access level is too low" (error 16) | Make a key with a higher access level, from a member who can see that faction data |
| "can't see that faction data" (error 7) | The key owner's faction position doesn't allow it |
| Too many requests | Wait a minute. The script stops itself at 90 calls a minute |
| Nothing happens on PDA | Check the script is enabled and reload the page |
| Alerts don't arrive | Alerts only run while Torn is open and a webhook is saved |

Found a bug? <a href="https://github.com/Ivylara198/faction-command-center/issues"><img alt="Report a problem" src="https://img.shields.io/badge/REPORT-A_problem-ed4245?style=flat-square&labelColor=141414"></a>

---

<p align="center">
  <a href="https://www.torn.com/profiles.php?XID=4393901"><img alt="Support me" src="https://img.shields.io/badge/SUPPORT_ME-IvyLara_%5B4393901%5D-ff3d8b?style=for-the-badge&labelColor=141414"></a>
</p>

<p align="center">Free to use. Please don't re-upload or edit and redistribute it, see <a href="LICENSE">LICENSE</a>.</p>
