# How to configure Gmail for MFA email reading

OpenVault can read MFA codes from your Gmail inbox automatically using IMAP and a Google App Password.

## Steps

1. Go to **myaccount.google.com → Security & sign-in**
2. Confirm **2-Step Verification** is on — App Passwords won't appear without it
3. In the search bar at the top of your Google Account page, search **"App passwords"**
4. Click **"App passwords"** in the results
5. Give it a name (e.g. `OpenVault`) and click **Create**
6. Copy the 16-character password — you won't see it again

## Storing the App Password

Run the built-in config command — it will prompt for your Gmail address and App Password and save them securely to the macOS Keychain:

```bash
npm run cli -- config gmail
```
