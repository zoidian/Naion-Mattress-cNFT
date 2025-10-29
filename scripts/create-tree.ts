import {
  createSignerFromKeypair,
  generateSigner,
  keypairIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createTreeV2, mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";

import {
  BACKEND_KEYPAIR,
  MERKLE_TREE_KEYPAIR,
  MERKLE_TREE_ADDRESS,
} from "@/lib/constants";

async function main() {
  const umi = createUmi("https://api.devnet.solana.com");

  const keypair = umi.eddsa.createKeypairFromSecretKey(BACKEND_KEYPAIR);
  console.log(`backend key: ${keypair.publicKey}`);

  umi.use(mplBubblegum()).use(keypairIdentity(keypair));

  const merkleTree = umi.eddsa.createKeypairFromSecretKey(MERKLE_TREE_KEYPAIR);
  console.log(`merkle tree address: ${merkleTree.publicKey}`);

  const builder = await createTreeV2(umi, {
    merkleTree: createSignerFromKeypair(umi, merkleTree),
    maxBufferSize: 64,
    maxDepth: 14,
  });
  await builder.sendAndConfirm(umi);
}

main();
