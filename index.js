const { App } = require("@slack/bolt");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  customRoutes: [
    {
      path: "/isalive",
      method: ["GET"],
      handler: (req, res) => {
        res.end();
      },
    },
    {
      path: "/isready",
      method: ["GET"],
      handler: (req, res) => {
        res.end();
      },
    },
  ],
});

(async () => {
  await app.start(process.env.PORT || 3000);

  console.log("⚡️ Bolt app is running!");
})();
