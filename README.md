<h1>Kalverion_bot — AI Telegram Personal Finance Bot</h1>

<p align="center">

<a href="https://github.com/bisbeebucky/ai-bot">
<img src="https://img.shields.io/github/stars/bisbeebucky/ai-bot?style=social" alt="GitHub stars">
</a>

<a href="https://github.com/bisbeebucky/ai-bot/fork">
<img src="https://img.shields.io/github/forks/bisbeebucky/ai-bot?style=social" alt="GitHub forks">
</a>

</p>

<p>
Kalverion_bot is an AI-powered Telegram personal finance assistant that uses
double-entry accounting, cashflow forecasting, and natural language transaction
parsing to help prevent overdrafts and plan your financial future.
</p>

<p align="center">
⭐ If you find this project useful, please consider giving it a star ⭐
</p>

<p align="center">
<img alt="version" src="https://img.shields.io/badge/version-v1.1.0-blue">
<img alt="node" src="https://img.shields.io/badge/node-18%2B-green">
<img alt="sqlite" src="https://img.shields.io/badge/database-SQLite-lightgrey">
<img alt="license" src="https://img.shields.io/badge/license-MIT-purple">
<img alt="platform" src="https://img.shields.io/badge/platform-Telegram-blue">
</p>

<hr>

<table>
<tr>

<td width="45%" valign="top">

<img src="docs/IMG_0139.PNG" width="420" alt="Kalverion Telegram screenshot">

</td>

<td width="55%" valign="top" style="padding-left:30px;">

<h2>Features</h2>

🦞 Built with OpenClaw for AI-powered Telegram interaction<br>
📒 Double-entry accounting<br>
📊 Cashflow forecasting<br>
🔁 Recurring bills &amp; income<br>
💳 Debt payoff optimization<br>
📈 Financial graphs<br>
🤖 AI transaction parsing with Natural Language

</td>
</tr>
</table>

<p align="center">
<a href="https://github.com/bisbeebucky/ai-bot"><strong>⭐ Star the repo</strong></a> •
<a href="HELP.md"><strong>📖 Commands</strong></a>
</p>

<hr>

<h2>Why I Built This</h2>

<p>
I started this project after getting hit with <strong>overdraft fees</strong>
and realizing I had no clear view of my short-term cashflow.
</p>

<p>
Most finance apps show what already happened. This bot focuses on
<strong>what will happen next</strong> — predicting your balance,
warning about danger windows, and helping you avoid overdrafts before they occur.
</p>

<hr>

<h2>⚡ Try it in 30 seconds</h2>

<pre><code>git clone https://github.com/bisbeebucky/ai-bot
cd ai-bot
npm install

# start the bot
node index.js
</code></pre>

<p>Then open Telegram and try:</p>

<pre><code>/add coffee 5
/forecast
/caniafford 120
</code></pre>

<hr>

<h2>🤖 Telegram Setup</h2>

<p>Open Telegram and search for <strong>@BotFather</strong>.</p>

<pre><code>/newbot</code></pre>

<p>BotFather will give you a <strong>bot token</strong>.</p>

<hr>

<h2>🔐 Set Environment Variables</h2>

<pre><code>export TELEGRAM_BOT_TOKEN=YOUR_TOKEN
export OPENAI_API_KEY=YOUR_KEY
</code></pre>

<p>Then start the bot:</p>

<pre><code>node index.js</code></pre>

<hr>

<h2>🔗 Pairing Telegram with OpenClaw</h2>

<p>
OpenClaw can connect your Telegram bot to an AI agent runtime.
</p>

<p>
<strong>⚠️ The pairing code may open in a different Telegram window.</strong>
</p>

<p>
During setup Telegram may open a separate conversation called
<strong>"Telegram"</strong> where the pairing code appears.
If you do not see the code in your current chat, check that window.
</p>

<hr>

<h2>💬 Natural Language Transactions</h2>

<p>
The bot can interpret plain English messages and convert them into proper
double-entry accounting entries.
</p>

<pre><code>I got paid 5000 windfall
bought groceries for 35
paid rent 1200
5 on coffee
</code></pre>

<p>
These messages are automatically converted into balanced ledger transactions.
</p>

<hr>

<h2>📊 Forecast Your Cashflow</h2>

<p>
Kalverion_bot simulates your future balance based on:
</p>

<ul>
<li>current transactions</li>
<li>recurring bills and income</li>
<li>debt payments</li>
<li>projected spending</li>
</ul>

<p>
The bot calculates your future balance curve and highlights risk windows
before they happen.
</p>

<pre><code>⚠️ Danger Window

Current Balance: $576.05
Lowest Balance:  $3.67
Date:            2026-04-03
Trigger:         Rent
Status:          ⚠️ Tight
</code></pre>

<p>
The bot warns you <strong>before an overdraft occurs</strong>.
</p>

<hr>

<h2>🚀 Production (PM2)</h2>

<pre><code>npm install -g pm2
pm2 start index.js --name ai-bot
pm2 save
</code></pre>

<pre><code>pm2 status
pm2 logs ai-bot
</code></pre>

<hr>

<h2>📂 Project Structure</h2>

<pre><code>ai-bot
├─ handlers/        # Telegram command handlers
├─ services/        # Business logic services
├─ bootstrap/       # Application bootstrapping
├─ models/          # SQLite database models
├─ utils/           # Shared utilities
├─ docs/            # Screenshots and documentation
├─ data/            # SQLite database files
├─ index.js         # Main entry point
├─ package.json
└─ README.md
</code></pre>

<hr>

<h2>Tech Stack</h2>

<ul>
<li>Node.js</li>
<li>SQLite</li>
<li>Double-entry ledger accounting</li>
<li>Telegram Bot API</li>
<li>OpenAI API</li>
<li>Chart.js graphs</li>
<li>OpenClaw agent framework</li>
</ul>

<hr>

<h2>Roadmap</h2>

<ul>
<li>Multi-user support</li>
<li>Improved financial forecasting</li>
<li>Additional financial graphs</li>
<li>Optional web dashboard</li>
<li>Better Natural Language transaction detection</li>
<li>Docker deployment</li>
</ul>

<hr>

<p align="center">
⭐ If this project helps you manage your finances or avoid overdrafts, consider giving it a star.
</p>

<p align="center">
<a href="HELP.md"><strong>Commands</strong></a>
</p>
