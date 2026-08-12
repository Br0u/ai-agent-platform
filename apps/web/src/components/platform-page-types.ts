import type { PortalAction } from "./product-portal-content";

export type PlatformDemoMessage =
  | string
  | {
      role: "user" | "assistant";
      text: string;
      cite?: string;
    };

export type PlatformDemo = {
  title: string;
  messages: readonly PlatformDemoMessage[];
  footer?: {
    placeholder: string;
    action: string;
  };
  note?: string;
  caption?: string;
};

export type PlatformPage = {
  slug: string;
  name: string;
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    tags: readonly string[];
    actions: readonly PortalAction[];
    visual: {
      title: string;
      description?: string;
      note?: string;
      messages?: PlatformDemo["messages"];
      footer?: PlatformDemo["footer"];
    };
  };
  sections: readonly {
    id?: string;
    tone?: "soft";
    eyebrow: string;
    title: string;
    lead?: string;
    body?: string;
    subheading?: string;
    visual?: string;
    demo?: PlatformDemo;
    flow?: readonly string[];
    note?: string;
    actions?: readonly PortalAction[];
    cards?: readonly {
      tag?: string;
      number?: string;
      title: string;
      lead?: string;
      description?: string;
      answer?: string;
      value?: string;
      points?: readonly string[];
      flow?: readonly string[];
      visual?: string;
      actions?: readonly PortalAction[];
    }[];
    table?: {
      columns: readonly string[];
      rows: readonly (readonly string[])[];
    };
    groups?: readonly {
      id: string;
      tag?: string;
      title: string;
      lead?: string;
      subheading?: string;
      cards: readonly {
        title: string;
        description?: string;
        points?: readonly string[];
        visual?: string;
      }[];
      flow?: readonly string[];
      visual?: string;
    }[];
  }[];
  business?: {
    eyebrow: string;
    title: string;
    lead: string;
    points: readonly { title: string; description: string }[];
    values: readonly { title: string; description: string }[];
    visual?: string;
    demo?: PlatformDemo;
    reason: readonly string[];
    workflowLabel?: string;
    workflow?: readonly string[];
    outcomes: readonly { title: string; description: string }[];
    scenesLead: string;
    scenes: readonly {
      title: string;
      description: string;
      actions: readonly PortalAction[];
    }[];
    note?: string;
  };
  cta?: {
    title: string;
    description: string;
    actions: readonly PortalAction[];
  };
};
