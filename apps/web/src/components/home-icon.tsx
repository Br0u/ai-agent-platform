import {
  Activity,
  Box,
  Code2,
  Database,
  Eye,
  FileText,
  Headphones,
  ImageIcon,
  Layers3,
  MessageSquareText,
  MonitorUp,
  Network,
  ShieldCheck,
} from "lucide-react";
import type { HomeIconName } from "./home-content";

const icons = {
  activity: Activity,
  box: Box,
  code: Code2,
  database: Database,
  eye: Eye,
  file: FileText,
  headphones: Headphones,
  image: ImageIcon,
  layers: Layers3,
  message: MessageSquareText,
  monitor: MonitorUp,
  network: Network,
  shield: ShieldCheck,
} satisfies Record<HomeIconName, typeof Activity>;

export function HomeIcon({ name }: { name: HomeIconName }) {
  const Icon = icons[name];

  return <Icon aria-hidden="true" focusable="false" strokeWidth={1.8} />;
}
