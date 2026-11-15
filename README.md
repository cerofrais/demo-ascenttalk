# AscenTalk demo

An interactive demo of **AscenTalk**, the communication platform for marketing agencies: one place for
client conversations (WhatsApp, email, calls, website chat, Telegram, Instagram, Messenger), team chat,
client records and manager oversight.

There is no login. Pick a role on the first screen and look around; each role sees what that person would
see in the real product. You can switch roles at any time from the sidebar.

## What is real and what is not

- The screens are the real AscenTalk web app, built in demo mode.
- There is no server behind it. Every client, contact, message, call and number is generated, and the
  "backend" runs in your browser. Phone numbers come from a range that cannot be dialled and email
  addresses use `.example` domains.
- What you do (replies, notes, assignments) is saved only in your browser. "Reset demo data" on the first
  screen puts everything back.
- Anything that needs a live provider (linking a WhatsApp number, connecting a mailbox, placing a call)
  is switched off and says so.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## About this repository

This repository is generated. The source lives in the main AscenTalk repository and is exported with
`scripts/export-demo.sh`, so changes made here directly will be overwritten by the next export.

Built by [Ascent](https://ascent-i-tech.com).
