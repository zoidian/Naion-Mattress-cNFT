import fs from "fs";
import {
  createSignerFromKeypair,
  generateSigner,
  keypairIdentity,
  createGenericFile,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys'

import { BACKEND_KEYPAIR } from "@/lib/constants";

async function main() {
  const umi = createUmi("https://api.devnet.solana.com").use(irysUploader());

  const keypair = umi.eddsa.createKeypairFromSecretKey(BACKEND_KEYPAIR);
  console.log(`backend key: ${keypair.publicKey}`);

  umi.use(keypairIdentity(keypair));

  const image = createGenericFile(
    fs.readFileSync("./mattress.webp"),
    "mattress.webp",
    {
      contentType: "image/webp",
    },
  );
  const [imageUrl] = await umi.uploader.upload([image]);
  console.log({ imageUrl });
}

main();
