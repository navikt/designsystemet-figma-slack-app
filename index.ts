import { request } from "https";
import { App } from "@slack/bolt";
import {
  Block,
  ChatPostMessageArguments,
  ChatPostMessageResponse,
  Method,
} from "@slack/web-api";

interface LibraryItemData {
  name: string;
  key: string;
}

interface Publish {
  file_name: string;
  file_key: string;
  triggered_by: {
    handle: string;
  };
  description: string;
  created_components: LibraryItemData[];
  modified_components: LibraryItemData[];
  deleted_components: LibraryItemData[];
  created_styles: LibraryItemData[];
  modified_styles: LibraryItemData[];
  deleted_styles: LibraryItemData[];
  timestamp: string;
  event_type: string;
  passcode: string;
}

const getLibraryPublishMessage = async ({
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
}: Publish): Promise<ChatPostMessageArguments> => {
  const text = `Changes to Figma library <https://www.figma.com/file/${file_key}/Filename|${file_name}> published by ${handle}.`;

  const cudSection = (
    heading: string,
    created: LibraryItemData[],
    updated: LibraryItemData[],
    deleted: LibraryItemData[]
  ) => {
    const list = (list: LibraryItemData[], name: string) => {
      const names = Array.from(
        new Set<string>(list.map(({ name }) => `${name}`).filter((n) => n))
      );
      return names.length ? `${name}: ${names.join(", ")}` : "";
    };

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

  const fetchComponent = async (key: string) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: "api.figma.com",
          path: `/v1/components/${key}`,
          method: "GET",
          headers: {
            "X-Figma-Token": process.env.FIGMA_TOKEN,
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            reject();
          }

          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            resolve(JSON.parse(data));
          });
        }
      );

      req.on("error", (error) => {
        reject(error);
      });

      req.end();
    });

  const [created, modified, deleted] = await Promise.all(
    [created_components, modified_components, deleted_components].map(
      async (components) =>
        await Promise.all(
          components.map(async ({ name, key }) => {
            if (name.includes("=")) {
              const comp: any = await fetchComponent(key);
              return {
                name: comp?.meta?.containing_frame?.name,
                key,
              };
            } else {
              return { name, key };
            }
          })
        )
    )
  );

  return {
    channel: "designsystemet-figma",
    text: `Changes published to Figma library ${file_name}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: description ? `${text}\n>${description}` : text,
        },
      },
      cudSection("Components", created, modified, deleted),
      cudSection("Styles", created_styles, modified_styles, deleted_styles),
    ].filter((n) => n) as Block[],
  };
};

let publishReqs: Publish[] = [];
let timeoutID: NodeJS.Timeout;
let postedPublishes: Publish[] = [];

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
              res.writeHead(401);
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
                  let publishes: Publish[] = [];
                  publishReqs.forEach((publishReq) => {
                    let publish = publishes.find(
                      (publish) =>
                        publish.file_key === publishReq.file_key &&
                        publish.timestamp === publishReq.timestamp
                    );
                    if (publish) {
                      publish.created_components;
                      const keys: Array<
                        | "created_components"
                        | "modified_components"
                        | "deleted_components"
                        | "created_styles"
                        | "modified_styles"
                        | "deleted_styles"
                      > = [
                        "created_components",
                        "modified_components",
                        "deleted_components",
                        "created_styles",
                        "modified_styles",
                        "deleted_styles",
                      ];
                      publish = keys.reduce((publish, key) => {
                        publish[key] = Array.from<LibraryItemData>(
                          new Set([...publish[key], ...publishReq[key]])
                        );
                        return publish;
                      }, publish);
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

                      getLibraryPublishMessage(publish).then(
                        app.client.chat.postMessage
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
  await app.start(Number(process.env.PORT) || 3000);

  console.log("Bolt app is running!");
})();
