import type { Category } from "@/lib/types";

// The ten launch categories from the product brief.
export const sampleCategories: Category[] = [
  { slug: "ai-agents", name: "AI Agents", icon: "bot", description: "Frameworks and apps for agents that plan, use tools and act on your behalf." },
  { slug: "coding-assistants", name: "Coding Assistants", icon: "code", description: "AI pair programmers for your editor and terminal." },
  { slug: "local-llms", name: "Local LLMs", icon: "cpu", description: "Run language models on your own hardware, privately and offline." },
  { slug: "ai-automation", name: "AI Automation", icon: "workflow", description: "Workflow builders that wire AI into everyday processes." },
  { slug: "seo-marketing", name: "SEO & Marketing", icon: "trending-up", description: "Audit, research and optimize content with AI." },
  { slug: "image-generation", name: "Image Generation", icon: "image", description: "Create and edit images with diffusion models." },
  { slug: "video-generation", name: "Video Generation", icon: "clapperboard", description: "Open models and tools for generating video." },
  { slug: "rag-knowledge", name: "RAG & Knowledge", icon: "library", description: "Connect LLMs to your documents and data." },
  { slug: "developer-tools", name: "Developer Tools", icon: "wrench", description: "Libraries and infrastructure for building AI apps." },
  { slug: "productivity", name: "Productivity", icon: "sparkles", description: "Everyday AI tools for chat, writing and getting things done." },
];
