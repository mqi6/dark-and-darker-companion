import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import protobuf from "protobufjs";

const protoDirectory = resolve("src/protocol/schema/protos");
const files = ["_PacketCommand.proto", "_Item.proto", "_Character.proto", "_Chat.proto", "Common.proto", "Inventory.proto", "Lobby.proto", "MarketPlace.proto"];
const root = await protobuf.load(files.map(file => resolve(protoDirectory, file)));
root.resolveAll();
const output = resolve("src/protocol/schema/pinned-schema.json");
await mkdir(resolve("src/protocol/schema"), { recursive: true });
await writeFile(output, `${JSON.stringify(root.toJSON(), null, 2)}\n`, "utf8");
console.log(`Generated ${output} from ${files.length} pinned proto files.`);
