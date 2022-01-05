const { App } = require("@slack/bolt");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  customRoutes: [
    {
      path: "/",
      method: ["GET"],
      handler: (req, res) => {
        app.client.chat.postMessage({
          channel: "designsystemet-figma",
          text: "Hello from docker!",
        });
        res.end("Hello from docker!");
      },
    },
  ],
});

(async () => {
  await app.start(process.env.PORT || 3000);

  console.log("⚡️ Bolt app is running!");
})();
