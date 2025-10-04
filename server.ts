import express from "express";
const { google } = require('googleapis');

const app = express();

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URL
);


app.get("/auth", async (req, res) => {
    //generate the link

    // generate a url that asks permissions for Google Calendar scopes
    const scopes = ['https://www.googleapis.com/auth/calendar'];

    const url = oauth2Client.generateAuthUrl({
        //We want users to keep logged-in forever. That's why we use refresh-token instead of access-token.
        // 'online' (default) or 'offline' (gets refresh_token)
        access_type: 'offline',
        prompt: 'consent',
        // If you only need one scope, you can pass it as a string
        scope: scopes
    });
    res.redirect(url);
})

app.get("/callback", async (req, res) => {
    const code = req.query.code as string;
    //exchange code with access token & refresh token
    // This will provide an object with the access_token and refresh_token.
    // Save these somewhere safe so they can be used at a later time(for creating calender events).
    const { tokens } = await oauth2Client.getToken(code)
    console.log("Access Token & Refresh Token: ", tokens);

    
    //If the access token is expired then with the help of refresh token we will generate a new access token.
    res.send("Connected to Google Calendar successfully! You can now close this tab.")
})

app.listen(3600, () => {
    console.log("Server is running on http://localhost:3600");
    console.log("Go to http://localhost:3600/auth to connect to Google Calendar");
});