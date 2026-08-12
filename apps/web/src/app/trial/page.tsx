import { TrialExperience } from "@/components/trial-experience";
import type { Metadata } from "next";
import "./trial.css";

export const metadata: Metadata = {
  title: "开启企业 AI 落地体验 · 华鲲",
  description:
    "填写以下信息，我们的产品顾问将在 24 小时内与您联系，安排元启平台或独立产品的体验。",
};

export default function Page() {
  return <TrialExperience />;
}
