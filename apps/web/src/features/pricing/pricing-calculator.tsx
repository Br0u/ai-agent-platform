"use client";

import Link from "next/link";
import { useState } from "react";

import {
  DEFAULT_PRICING_SELECTION,
  DEPLOYMENT_OPTIONS,
  MODULE_OPTIONS,
  SCALE_OPTIONS,
  TERM_OPTIONS,
  type DeploymentId,
  type PricingModuleId,
  type PricingSelection,
  type ScaleId,
  type TermId,
} from "./pricing-config";
import { buildPricingContactHref } from "./pricing-query";
import { buildPricingSummary } from "./pricing-summary";

import "./pricing-calculator.css";

const DISABLED_EXPLANATION_ID = "pricing-contact-requirement";

export function PricingCalculator() {
  const [selection, setSelection] = useState<PricingSelection>({
    ...DEFAULT_PRICING_SELECTION,
    modules: [...DEFAULT_PRICING_SELECTION.modules],
  });
  const canContact = selection.modules.length > 0;

  function setField<Key extends "deployment" | "scale" | "term">(
    field: Key,
    value: PricingSelection[Key],
  ) {
    setSelection((current) => ({ ...current, [field]: value }));
  }

  function toggleModule(moduleId: PricingModuleId) {
    setSelection((current) => ({
      ...current,
      modules: current.modules.includes(moduleId)
        ? current.modules.filter((id) => id !== moduleId)
        : [...current.modules, moduleId],
    }));
  }

  return (
    <div className="pricing-calculator">
      <section className="pricing-panel pricing-config" aria-label="需求配置">
        <div className="pricing-field">
          <label htmlFor="pricing-deployment">部署方式</label>
          <select
            id="pricing-deployment"
            value={selection.deployment}
            onChange={(event) =>
              setField("deployment", event.target.value as DeploymentId)
            }
          >
            {DEPLOYMENT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="pricing-field">
          <label htmlFor="pricing-scale">使用规模</label>
          <select
            id="pricing-scale"
            value={selection.scale}
            onChange={(event) =>
              setField("scale", event.target.value as ScaleId)
            }
          >
            {SCALE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="pricing-modules">
          <legend>功能模块</legend>
          <div className="pricing-module-grid">
            {MODULE_OPTIONS.map((option) => (
              <label key={option.id} className="pricing-module-option">
                <input
                  type="checkbox"
                  checked={selection.modules.includes(option.id)}
                  onChange={() => toggleModule(option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="pricing-field">
          <label htmlFor="pricing-term">服务周期</label>
          <select
            id="pricing-term"
            value={selection.term}
            onChange={(event) => setField("term", event.target.value as TermId)}
          >
            {TERM_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="pricing-panel pricing-summary" aria-label="方案摘要">
        <p className="pricing-eyebrow">需求概览</p>
        <h2>当前方案</h2>
        <ul role="status" aria-label="当前需求摘要" aria-live="polite">
          {buildPricingSummary(selection).map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
        <p className="pricing-disclosure">
          在线估算尚未开放，最终价格以商务报价为准
        </p>
        {!canContact && (
          <p id={DISABLED_EXPLANATION_ID} className="pricing-explanation">
            请至少选择一个功能模块后获取正式报价。
          </p>
        )}
        {canContact ? (
          <Link
            className="pricing-contact"
            href={buildPricingContactHref(selection)}
          >
            获取正式报价
          </Link>
        ) : (
          <a
            aria-describedby={DISABLED_EXPLANATION_ID}
            aria-disabled="true"
            className="pricing-contact"
            onClick={(event) => event.preventDefault()}
            role="link"
            tabIndex={0}
          >
            获取正式报价
          </a>
        )}
      </section>
    </div>
  );
}
