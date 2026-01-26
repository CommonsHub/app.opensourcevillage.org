# /setup route

This route is publicly accessible for configuring NFC tags.

Shows a simple form:
- Input: Serial Number
- Button: Generate URL

Generated URL format: `app.opensourcevillage.org/badge#{serialNumber}`

**IMPORTANT:** The serialNumber is in the URL fragment (after #) so it's never sent to the server when the URL is opened. It stays entirely client-side.

Instructions on page: "Write this URL to your NFC tag using your phone's NFC tools." 
