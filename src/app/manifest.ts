import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ticketera",
    short_name: "Ticketera",
    description: "Spanish grocery receipt scanner, price history intelligence, and personal inflation platform",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#10b981",
    orientation: "portrait",
    categories: ["finance", "shopping", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Upload Receipt",
        short_name: "Upload",
        description: "Upload and scan new grocery receipts",
        url: "/upload",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Price Comparison",
        short_name: "Compare",
        description: "Compare supermarket basket prices",
        url: "/compare",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Product Catalogue",
        short_name: "Products",
        description: "Browse tracked products and prices",
        url: "/products",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    share_target: {
      action: "/upload-share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "file",
            accept: ["image/*", "application/pdf"],
          },
        ],
      },
    },
  };
}
