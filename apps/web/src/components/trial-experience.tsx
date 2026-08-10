"use client";

import Link from "next/link";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { trialContent } from "./trial-content";

type FormValues = {
  name: string;
  company: string;
  contact: string;
  code: string;
};

const emptyForm: FormValues = { name: "", company: "", contact: "", code: "" };
const phonePattern = /^1[3-9]\d{9}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

function validContact(value: string) {
  return phonePattern.test(value) || emailPattern.test(value);
}

export function TrialExperience() {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(emptyForm);
  const [demoCode, setDemoCode] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function reset(nextOpen: boolean) {
    setValues(emptyForm);
    setDemoCode("");
    setMessage("");
    setSubmitted(false);
    setOpen(nextOpen);
  }

  function update(name: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setMessage("");
  }

  function sendCode() {
    if (!validContact(values.contact.trim())) {
      setMessage("请填写正确的手机号或邮箱");
      return;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    setDemoCode(code);
    setMessage(`验证码已发送：${code}（演示，正式版短信/邮件发送）`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!values.name.trim()) setMessage("请填写姓名");
    else if (!validContact(values.contact.trim()))
      setMessage("请填写正确的手机号或邮箱");
    else if (!demoCode || values.code.trim() !== demoCode)
      setMessage("验证码不正确，请重新获取");
    else if (!values.company.trim()) setMessage("请填写所属公司");
    else {
      setMessage("");
      setSubmitted(true);
    }
  }

  return (
    <main className="trial" data-trial-ready={ready}>
      <section className="trial-hero">
        <div className="trial-frame trial-hero__layout">
          <div>
            <p className="trial-eyebrow">{trialContent.hero.eyebrow}</p>
            <h1>{trialContent.hero.title}</h1>
            <p className="trial-lead">{trialContent.hero.lead}</p>
            <div className="trial-tags" aria-label="可体验产品">
              {trialContent.hero.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="trial-actions">
              <button
                className="trial-button trial-button--primary"
                disabled={!ready}
                onClick={() => reset(true)}
              >
                立即填写申请
              </button>
              <Link className="trial-button" href="/contact">
                联系我们
              </Link>
            </div>
          </div>
          <div className="trial-visual">{trialContent.hero.visual}</div>
        </div>
      </section>

      <section className="trial-section" aria-labelledby="trial-flow-title">
        <div className="trial-frame">
          <p className="trial-eyebrow">{trialContent.flow.eyebrow}</p>
          <h2 id="trial-flow-title">{trialContent.flow.title}</h2>
          <ol className="trial-flow">
            {trialContent.flow.steps.map((item) => (
              <li key={item.step}>
                <span>{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="trial-section trial-closing">
        <div className="trial-frame trial-closing__panel">
          <div>
            <h2>{trialContent.cta.title}</h2>
            <p>{trialContent.cta.description}</p>
          </div>
          <button
            className="trial-button trial-button--primary"
            disabled={!ready}
            onClick={() => reset(true)}
          >
            {trialContent.cta.action}
          </button>
        </div>
      </section>

      {open ? (
        <div className="trial-dialog-backdrop">
          <dialog
            aria-labelledby="trial-dialog-title"
            aria-modal="true"
            className="trial-dialog"
            open
          >
            {submitted ? (
              <div className="trial-success">
                <span aria-hidden="true">✓</span>
                <h2 id="trial-dialog-title">{trialContent.success.title}</h2>
                <p>{trialContent.success.description}</p>
                <button
                  className="trial-button trial-button--primary"
                  onClick={() => reset(false)}
                >
                  {trialContent.success.action}
                </button>
              </div>
            ) : (
              <>
                <div className="trial-dialog__heading">
                  <div>
                    <h2 id="trial-dialog-title">{trialContent.form.title}</h2>
                    <p>{trialContent.form.description}</p>
                  </div>
                  <button
                    aria-label="关闭申请弹层"
                    className="trial-dialog__close"
                    onClick={() => reset(false)}
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={submit}>
                  {trialContent.form.fields.map((field) => (
                    <label
                      className={`trial-field trial-field--${field.name}`}
                      key={field.name}
                    >
                      <span>{field.label}</span>
                      <span className="trial-field__control">
                        <input
                          autoComplete="off"
                          name={field.name}
                          onChange={(event) =>
                            update(
                              field.name as keyof FormValues,
                              event.target.value,
                            )
                          }
                          placeholder={field.placeholder}
                          value={values[field.name as keyof FormValues]}
                        />
                        {field.name === "contact" ? (
                          <button type="button" onClick={sendCode}>
                            {trialContent.form.sendCode}
                          </button>
                        ) : null}
                      </span>
                    </label>
                  ))}
                  <p
                    className="trial-form-message"
                    role="status"
                    aria-live="polite"
                  >
                    {message}
                  </p>
                  <div className="trial-dialog__actions">
                    <button
                      className="trial-button trial-button--primary"
                      type="submit"
                    >
                      {trialContent.form.submit}
                    </button>
                    <button
                      className="trial-button"
                      type="button"
                      onClick={() => reset(false)}
                    >
                      {trialContent.form.cancel}
                    </button>
                  </div>
                </form>
              </>
            )}
          </dialog>
        </div>
      ) : null}
    </main>
  );
}
