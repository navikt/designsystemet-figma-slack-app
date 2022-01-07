const { App } = require("@slack/bolt");

const libraryPublishMessage = ({
  file_name,
  file_key,
  triggered_by: { handle },
  description,
  created_components,
  modified_components,
  deleted_components,
  created_styles,
  modified_styles,
  deleted_styles,
}) => {
  const text = `Changes to Figma library <https://www.figma.com/file/${file_key}/Filename|${file_name}> published by ${handle}.`;

  const cudSection = (heading, created, updated, deleted) => {
    const list = (list, name) =>
      list.length && `${name}: ${list.map(({ name }) => `${name}`).join(", ")}`;

    return (
      [created, updated, deleted].some((l) => l.length) && {
        type: "section",
        text: {
          text: `*${heading}*\n${[
            list(created, "Added"),
            list(updated, "Modified"),
            list(deleted, "Removed"),
          ]
            .filter((s) => s)
            .join("\n")}`,
          type: "mrkdwn",
        },
      }
    );
  };
  return {
    channel: "designsystemet-figma",
    text: `Changes published to Figma library ${file_key}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: description ? `${text}\n>${description}` : text,
        },
      },
      cudSection(
        "Components",
        created_components,
        modified_components,
        deleted_components
      ),
      cudSection("Styles", created_styles, modified_styles, deleted_styles),
    ].filter((n) => n),
  };
};

let publishReqs = [];
let timeoutID;
let postedPublishes = [];

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  customRoutes: [
    {
      path: "/",
      method: ["POST"],
      handler: (req, res) => {
        try {
          let data = "";
          req.on("data", (chunk) => {
            data += chunk;
          });
          req.on("end", () => {
            const body = JSON.parse(data);
            if (body.passcode !== process.env.FIGMA_WEBHOOK_PASSCODE) {
              res.statusCode(401);
              res.end();
            }
            if (body.event_type === "LIBRARY_PUBLISH") {
              publishReqs.push(body);
              console.log(
                "LIBRARY_PUBLISH request:\n",
                JSON.stringify(body, null, 2)
              );
              timeoutID = setTimeout(() => {
                if (publishReqs.length) {
                  let publishes = [];
                  publishReqs.forEach((publishReq) => {
                    let publish = publishes.find(
                      (publish) =>
                        publish.file_key === publishReq.file_key &&
                        publish.timestamp === publishReq.timestamp
                    );
                    if (publish) {
                      [
                        "created_components",
                        "modified_components",
                        "deleted_components",
                        "created_styles",
                        "modified_styles",
                        "deleted_styles",
                      ].forEach(
                        (key) =>
                          (publish[key] = [
                            ...new Set([...publish[key], ...publishReq[key]]),
                          ])
                      );
                    } else {
                      publishes.push(publishReq);
                    }
                  });
                  publishes.forEach((publish) => {
                    if (
                      !postedPublishes.find(
                        (postedPublish) =>
                          publish.file_key === postedPublish.file_key &&
                          publish.timestamp === postedPublish.timestamp
                      )
                    ) {
                      postedPublishes.push(publish);
                      app.client.chat.postMessage(
                        libraryPublishMessage(publish)
                      );
                    }
                  });
                  publishReqs = [];
                  clearTimeout(timeoutID);
                }
              }, 10000);
            }
            res.end();
          });
        } catch (e) {
          console.error("Error on POST:", e);
        }
      },
    },
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
