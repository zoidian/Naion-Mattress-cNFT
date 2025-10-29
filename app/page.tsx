"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { useWallet } from "@solana/wallet-adapter-react";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

import {
  createSignerFromKeypair,
  keypairIdentity,
  none,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { irysUploader } from "@capult/umi-uploader-irys-web";
import {
  mintV2,
  mplBubblegum,
  parseLeafFromMintV2Transaction,
} from "@metaplex-foundation/mpl-bubblegum";
import { BACKEND_KEYPAIR, MERKLE_TREE_ADDRESS } from "@/lib/constants";

const mattressSizes = [
  { name: "Small single", dimensions: "75 x 190", weight: "10-13" },
  { name: "Single", dimensions: "90 x 190", weight: "16-27" },
  { name: "Small double (Queen)", dimensions: "120 x 190", weight: "24-30" },
  { name: "Double", dimensions: "135 x 190", weight: "35-40" },
  { name: "King", dimensions: "150 x 200", weight: "40-70" },
  { name: "Super king", dimensions: "180 x 200", weight: "51-82" },
];

const materialCompositions = ["Springs and Foam", "Foam only"];

const conditionAssessments = [
  "Reusable good",
  "Reusable poor",
  "Non-reusable good",
  "Non-reusable poor",
  "Contaminated good",
  "Contaminated poor",
];

const statusOptions = [
  "EoL",
  "received",
  "stored",
  "processing",
  "landfill",
  "incinerated",
  "downcycled",
  "upcycled",
];

interface MattressItem {
  id: string;
  mattressSize: string;
  materialComposition: string;
  conditionAssessment: string;
  collectionDate: string;
  status: string;
  nftAddress: string;
  timestamp: number;
}

export default function WasteCollectionPage() {
  const wallet = useWallet();
  const { connected, publicKey } = wallet;
  const [activeView, setActiveView] = useState<"register" | "inventory">(
    "register",
  );
  const [formData, setFormData] = useState({
    mattressSize: "",
    materialComposition: "",
    conditionAssessment: "",
    collectionDate: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mintedNFT, setMintedNFT] = useState<string | null>(null);
  const [inventory, setInventory] = useState<MattressItem[]>([]);

  useEffect(() => {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
    setFormData((prev) => ({ ...prev, collectionDate: localDate }));

    const savedInventory = localStorage.getItem("mattressInventory");
    if (savedInventory) {
      setInventory(JSON.parse(savedInventory));
    }
  }, []);

  const selectedSize = mattressSizes.find(
    (s) => s.name === formData.mattressSize,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected) {
      alert("Please connect your Solana wallet first");
      return;
    }

    setIsSubmitting(true);

    const umi = createUmi("http://api.devnet.solana.com")
      .use(walletAdapterIdentity(wallet))
      .use(mplBubblegum());

    const keypair = createSignerFromKeypair(
      umi,
      umi.eddsa.createKeypairFromSecretKey(BACKEND_KEYPAIR),
    );

    const umiUploader = createUmi("http://api.devnet.solana.com")
      .use(irysUploader())
      .use(keypairIdentity(keypair));
    // upload metadata
    const metadata = {
      name:
        "MTR-" +
        [0, 0, 0].map(() => ((0xff * Math.random()) | 0).toString(16)).join(""),
      symbol: "MTR",
      description: [
        "CLU - Closed Loop Upcycling System",
        "",
        "Powered by Naion Ltd",
        "",
        "This Waste Collection App is used for creating the first digital passport of a mattress that has become end of life.Tracking the chain of custody of the mattress perpetually throughout the closed loop upcycling system.",
      ].join("\n"),
      image:
        "https://gateway.irys.xyz/5Fu9qg1ApBoKk6TbCmK9rxqVAY5vadQxVLT7NBMBVfjw",
      attributes: Object.entries({
        mattressSize: formData.mattressSize,
        materialComposition: formData.materialComposition,
        conditionAssessment: formData.conditionAssessment,
        collectionDate: formData.collectionDate,
        timestamp: Date.now(),
      }).map(([trait_type, value]) => ({ trait_type, value })),
    };
    const metadataUri = await umiUploader.uploader.uploadJson(metadata);
    console.log(`uploaded metadata to ${metadataUri}`);

    // mint nft
    const { signature, result } = await mintV2(umi, {
      leafOwner: umi.identity.publicKey,
      merkleTree: MERKLE_TREE_ADDRESS,
      metadata: {
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadataUri,
        sellerFeeBasisPoints: 100,
        collection: none(),
        creators: [],
      },
      treeCreatorOrDelegate: keypair,
    }).sendAndConfirm(umi, {
      confirm: {
        commitment: "finalized",
      },
    });
    console.log(`mint tx sent`, signature, result);

    const leaf = await parseLeafFromMintV2Transaction(umi, signature);
    const assetId = leaf.id;

    setMintedNFT(assetId);

    const newMattress: MattressItem = {
      id: `MTR-${Date.now()}`,
      mattressSize: formData.mattressSize,
      materialComposition: formData.materialComposition,
      conditionAssessment: formData.conditionAssessment,
      collectionDate: formData.collectionDate,
      status: "received",
      nftAddress: assetId,
      timestamp: Date.now(),
    };

    const updatedInventory = [newMattress, ...inventory];
    setInventory(updatedInventory);
    localStorage.setItem("mattressInventory", JSON.stringify(updatedInventory));

    setIsSubmitting(false);

    setFormData({
      mattressSize: "",
      materialComposition: "",
      conditionAssessment: "",
      collectionDate: formData.collectionDate,
    });
  };

  const updateMattressStatus = (id: string, newStatus: string) => {
    const updatedInventory = inventory.map((item) =>
      item.id === id ? { ...item, status: newStatus } : item,
    );
    setInventory(updatedInventory);
    localStorage.setItem("mattressInventory", JSON.stringify(updatedInventory));
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      EoL: "bg-gray-500",
      received: "bg-blue-500",
      stored: "bg-purple-500",
      processing: "bg-yellow-500",
      landfill: "bg-red-500",
      incinerated: "bg-orange-500",
      downcycled: "bg-amber-500",
      upcycled: "bg-green-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const getConditionColor = (condition: string) => {
    if (condition.includes("Reusable"))
      return "bg-green-500/20 text-green-700 border-green-500/30";
    if (condition.includes("Non-reusable"))
      return "bg-orange-500/20 text-orange-700 border-orange-500/30";
    if (condition.includes("Contaminated"))
      return "bg-red-500/20 text-red-700 border-red-500/30";
    return "bg-gray-500/20 text-gray-700 border-gray-500/30";
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Image
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/naion-icon-97aZeO1ucJSfu6GS9SnUyHULZEVggA.png"
              alt="Naion"
              width={48}
              height={48}
              className="h-12 w-12"
            />
            <div>
              <h1 className="text-xl font-bold text-foreground">
                BIFFA Waste Collection
              </h1>
              <p className="text-sm text-muted-foreground">
                Blockchain Waste Transfer System
              </p>
            </div>
          </div>
          <WalletMultiButton className="!bg-primary !text-primary-foreground hover:!bg-primary/90" />
        </div>
      </header>

      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex gap-2">
            <Button
              variant={activeView === "register" ? "default" : "ghost"}
              className={`rounded-b-none ${
                activeView === "register"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveView("register")}
            >
              Register Waste
            </Button>
            <Button
              variant={activeView === "inventory" ? "default" : "ghost"}
              className={`rounded-b-none ${
                activeView === "inventory"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveView("inventory")}
            >
              Inventory
            </Button>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        {activeView === "register" ? (
          <div className="mx-auto max-w-3xl">
            <Card className="border-2 border-border bg-card shadow-lg">
              <CardHeader className="border-b border-border bg-muted/30">
                <CardTitle className="text-2xl text-foreground">
                  Waste Transfer Note (WTN)
                </CardTitle>
                <div className="mt-4 flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="bg-accent text-accent-foreground"
                  >
                    EWC Code: 20 03 07
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-primary text-primary"
                  >
                    Mattresses
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pt-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Collector Information */}
                  <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                    <h3 className="font-semibold text-foreground">
                      Collector Information
                    </h3>
                    <div className="space-y-2">
                      <Label htmlFor="collectionDate">Collection Date</Label>
                      <Input
                        id="collectionDate"
                        type="date"
                        value={formData.collectionDate}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Collection Location</Label>
                      <Input value="Manchester" disabled className="bg-muted" />
                    </div>
                  </div>

                  {/* Mattress Details */}
                  <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                    <h3 className="font-semibold text-foreground">
                      Mattress Details
                    </h3>
                    <div className="space-y-2">
                      <Label htmlFor="mattressSize">Mattress Size</Label>
                      <Select
                        value={formData.mattressSize}
                        onValueChange={(value) =>
                          setFormData({ ...formData, mattressSize: value })
                        }
                        required
                      >
                        <SelectTrigger
                          id="mattressSize"
                          className="bg-background"
                        >
                          <SelectValue placeholder="Select mattress size" />
                        </SelectTrigger>
                        <SelectContent>
                          {mattressSizes.map((size) => (
                            <SelectItem key={size.name} value={size.name}>
                              {size.name} ({size.dimensions} cm)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedSize && (
                      <div className="grid grid-cols-2 gap-4 rounded-md bg-accent/20 p-3">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Dimensions
                          </p>
                          <p className="font-medium text-foreground">
                            {selectedSize.dimensions} cm
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Weight Range
                          </p>
                          <p className="font-medium text-foreground">
                            {selectedSize.weight} kg
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Material Composition */}
                  <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                    <h3 className="font-semibold text-foreground">
                      Material Composition
                    </h3>
                    <RadioGroup
                      value={formData.materialComposition}
                      onValueChange={(value) =>
                        setFormData({ ...formData, materialComposition: value })
                      }
                      required
                    >
                      {materialCompositions.map((material) => (
                        <div
                          key={material}
                          className="flex items-center space-x-2"
                        >
                          <RadioGroupItem value={material} id={material} />
                          <Label
                            htmlFor={material}
                            className="cursor-pointer font-normal"
                          >
                            {material}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* Condition Assessment */}
                  <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                    <h3 className="font-semibold text-foreground">
                      Condition Assessment
                    </h3>
                    <RadioGroup
                      value={formData.conditionAssessment}
                      onValueChange={(value) =>
                        setFormData({ ...formData, conditionAssessment: value })
                      }
                      required
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        {conditionAssessments.map((condition) => (
                          <div
                            key={condition}
                            className="flex items-center space-x-2"
                          >
                            <RadioGroupItem value={condition} id={condition} />
                            <Label
                              htmlFor={condition}
                              className="cursor-pointer font-normal"
                            >
                              {condition}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    size="lg"
                    disabled={!connected || isSubmitting}
                  >
                    {isSubmitting
                      ? "Minting WTN NFT..."
                      : "Mint Collected Waste"}
                  </Button>

                  {!connected && (
                    <p className="text-center text-sm text-muted-foreground">
                      Please connect your Solana wallet to mint the WTN
                    </p>
                  )}

                  {mintedNFT && (
                    <div className="rounded-lg border-2 border-primary bg-primary/10 p-4">
                      <p className="mb-2 font-semibold text-foreground">
                        ✓ WTN Successfully Minted!
                      </p>
                      <p className="text-sm text-muted-foreground">
                        NFT Address:{" "}
                        <a
                          href={`https://explorer.solana.com/address/${mintedNFT}?cluster=devnet`}
                          className="font-bold underline text-blue-700"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {mintedNFT}
                        </a>
                      </p>
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="mx-auto max-w-6xl">
            <Card className="border-2 border-border bg-card shadow-lg">
              <CardHeader className="border-b border-border bg-muted/30">
                <CardTitle className="text-2xl text-foreground">
                  Mattress Inventory
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Track all registered mattresses in the recycling chain
                </p>
              </CardHeader>
              <CardContent className="pt-6">
                {inventory.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-muted-foreground">
                      No mattresses registered yet
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4 bg-transparent"
                      onClick={() => setActiveView("register")}
                    >
                      Register First Mattress
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {inventory.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="border-primary/50 bg-primary/10 text-primary font-mono"
                          >
                            {item.id}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="bg-blue-500/20 text-blue-700 border-blue-500/30"
                          >
                            {item.mattressSize}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={getConditionColor(
                              item.conditionAssessment,
                            )}
                          >
                            {item.conditionAssessment}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="bg-purple-500/20 text-purple-700 border-purple-500/30"
                          >
                            {item.materialComposition}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="bg-slate-500/20 text-slate-700 border-slate-500/30"
                          >
                            {item.collectionDate}
                          </Badge>
                          <Badge
                            className={`${getStatusColor(item.status)} text-white border-0`}
                          >
                            {item.status}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 bg-transparent"
                        >
                          Transfer
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      <footer className="border-t border-border bg-card py-6">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-muted-foreground">Powered by</span>
            <Image
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/naion-logo%20%281%29-lWQp7sf6bkEN8BstffvKAVSiWS9tLb.png"
              alt="Naion"
              width={100}
              height={32}
              className="h-8 w-auto"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
