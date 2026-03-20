<h1>Kalverion_bot — AI Telegram Personal Finance Bot</h1>

<p align="center">
  <strong>Repository:</strong> ai-bot &nbsp;|&nbsp; <strong>Telegram bot:</strong> Kalverion_bot
</p>

<p align="center">
  <a href="https://github.com/bisbeebucky/ai-bot">
    <img src="https://img.shields.io/github/stars/bisbeebucky/ai-bot?style=social" alt="GitHub stars">
  </a>
  <a href="https://github.com/bisbeebucky/ai-bot/fork">
    <img src="https://img.shields.io/github/forks/bisbeebucky/ai-bot?style=social" alt="GitHub forks">
  </a>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-v1.1.0-blue">
  <img alt="node" src="https://img.shields.io/badge/node-18%2B-green">
  <img alt="sqlite" src="https://img.shields.io/badge/database-SQLite-lightgrey">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-purple">
  <img alt="platform" src="https://img.shields.io/badge/platform-Telegram-blue">
</p>

<h3>Stop Overdrafts Before They Happen: Self-Hosted AI Finance Bot for Telegram</h3>

<p>
Tired of finance apps that only tell you how you already spent your money? I built <strong>Kalverion Bot</strong> to focus on what happens next. 
Unlike most trackers, this is a self-hosted tool you run on your own infrastructure (like Digital Ocean), giving you total control over your sensitive financial data.
</p>

<p align="center">
⭐ If you find this project useful, please consider giving it a star ⭐
</p>

<hr>

<table>
<tr>
<td width="45%" valign="top">
  <img src="docs/IMG_0139.PNG" width="420" alt="Kalverion Telegram screenshot">
</td>
<td width="55%" valign="top" style="padding-left:30px;">

<h2>🛠 Features</h2>

📉 <b>Overdraft Warnings:</b> Predictive alerts based on upcoming bills and current balance.<br><br>
🔮 <b>Cashflow Forecasting:</b> Ask "What will my balance be on Friday?" to see your financial future.<br><br>
💸 <b>Debt Management:</b> Track progress on loans and credit cards with automated payoff planning.<br><br>
🗣 <b>Natural Language:</b> Powered by OpenClaw—no complex menus, just chat.<br><br>
🔒 <b>Privacy First:</b> Your financial history stays on your server, not in the cloud.<br><br>
🦞 <b>Built with OpenClaw</b> backend for AI-powered Telegram interaction

</td>
</tr>
</table>

<p align="center">
  <a href="https://github.com/bisbeebucky/ai-bot"><strong>⭐ Star the repo</strong></a> •
  <a href="HELP.md"><strong>📖 Commands</strong></a>
</p>

<hr>

<h2>Key Commands</h2>

<pre><code>/add coffee 5
/transfer 100
/debts_list
/debt_compare_graph 100
/forecast_graph
/future_graph 24
/milestones_graph
</code></pre>

<hr>

<h2>Why I Built This</h2>

<p>
I started this project after getting hit with <strong>overdraft fees</strong> 
and realizing I did not have a clear picture of my short-term cashflow.
</p>

<p>
Most finance apps are good at showing what already happened. This bot focuses on 
<strong>what will happen next</strong> — forecasting balances, warning about 
danger windows, tracking recurring expenses, and helping you make better 
decisions before problems happen.
</p>

<hr>

<h2>⚡ Quick Start</h2>

<p>Clone the repo and install dependencies:</p>

<pre><code>git clone https://github.com/bisbeebucky/ai-bot
cd ai-bot
npm install
</code></pre>

<h3>1. Create a Telegram bot</h3>

<p>Open Telegram and search for <strong>@BotFather</strong>, then run:</p>

<pre><code>/newbot</code></pre>

<p>BotFather will give you a <strong>bot token</strong>.</p>

<h3>2. Set environment variables</h3>

<pre><code>export TELEGRAM_BOT_TOKEN=YOUR_TOKEN
export OPENAI_API_KEY=YOUR_KEY
</code></pre>

<h3>3. Start the bot</h3>

<pre><code>node index.js
</code></pre>

<hr>

<h2>🔗 Pairing Telegram with OpenClaw</h2>

<p>
OpenClaw can connect your Telegram bot without pairing.
All you need is a your telegram token.
</p>

<hr>

<h2>💬 Natural Language Transactions</h2>

<p>
The bot can interpret plain English messages and convert them into balanced 
double-entry ledger transactions.
</p>

<pre><code>I got paid 5000 windfall
bought groceries for 35
paid rent 1200
5 on coffee
</code></pre>

<hr>

<h2>📊 Forecast Your Cashflow</h2>

<p>Kalverion_bot simulates your future balance based on current transactions, recurring bills, and debt payments.</p>

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

<p align="center">
⭐ If this project helps you manage your finances or avoid overdrafts, consider giving it a star.
</p>

<p align="center">
  <a href="HELP.md"><strong>📖 Commands</strong></a> • 
  <a href="https://github.com/bisbeebucky/ai-bot"><strong>⭐ Star the repo</strong></a>
</p>
