import { useMemo, useState } from "react";
import type { ReactNode, CSSProperties, MouseEvent, FormEvent } from "react";
import { Link } from "wouter";
import {
  Check, ChevronDown, Clock3, Copy, Headphones, Mail, MessageCircle,
  Phone, Search, Send, ShieldCheck, WalletCards, X,
} from "lucide-react";

const SUPPORT = {
  whatsappIntl: "233248062352",
  phoneLocal: "0248062352",
  phoneDisplay: "024 806 2352",
  telegramHandle: "@Kamuzu11",
  telegramUrl: "https://t.me/Kamuzu11",
  email: "support@hotbet.com",
};

function waHref(prefill?: string): string {
  const base = "https://wa.me/" + SUPPORT.whatsappIntl;
  if (prefill) {
    return base + "?text=" + encodeURIComponent(prefill);
  }
  return base;
}

const FAQS: { category: string; q: string; a: string }[] = [
  { category: "Account", q: "How do I create a HotBet account?", a: "Tap Join now, enter your email and a password, then complete your profile with your name and phone number. You can start browsing markets immediately after signup." },
  { category: "Account", q: "I forgot my password — what do I do?", a: "On the login page, select \"Forgot password?\" and follow the reset link sent to your email address." },
  { category: "Deposits", q: "How long do deposits take to reflect?", a: "Card and mobile money deposits via Paystack post to your wallet within seconds. Crypto deposits are reviewed manually and are usually credited within 30 minutes of submission." },
  { category: "Deposits", q: "My crypto deposit hasn't been credited yet", a: "Confirm you sent funds on the correct network and submitted the transaction ID on the Deposit page. Manual crypto deposits are reviewed by our team — most are confirmed within 30 minutes, but can take longer during busy periods." },
  { category: "Withdrawals", q: "How do I withdraw my winnings?", a: "Go to Wallet, select Withdraw, choose mobile money or bank transfer, and enter your account details. Requests are reviewed and settled by our finance team." },
  { category: "Withdrawals", q: "How long do withdrawals take?", a: "Most withdrawal requests are reviewed within a few hours and settled the same day. You'll see the status update in your wallet transaction history." },
  { category: "Betting", q: "How do I place a bet?", a: "Tap any odds on a match to add it to your betslip, enter a stake, then tap Place bet. You can combine multiple selections into one slip." },
  { category: "Betting", q: "What are 'estimated odds'?", a: "Some matches don't yet have live odds from our data feed. We show clearly-marked estimated odds so you can still see the match, but these are for reference only and can't be added to a betslip until real odds are published." },
  { category: "Betting", q: "Can I bet on live matches?", a: "Live match information updates in real time, but live markets are locked for selection while pricing is being finalised — this keeps pricing fair for everyone during fast-moving action." },
  { category: "Responsible play", q: "How do I set limits on my account?", a: "Visit your Account page to set deposit or stake limits, take a break, or self-exclude. Our team can also apply limits on request via the contact options below." },
];

const WA_ACCENT = "#25D366";
const TG_ACCENT = "#29A9EB";
const MAIL_ACCENT = "var(--gold-hi, #d4a843)";

function getChannelCardStyle(accent: string): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 12,
    textDecoration: "none",
    color: "inherit",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderLeft: "3px solid " + accent,
    transition: "transform .15s ease, background .15s ease",
  };
}

function getChannelIconStyle(accent: string): CSSProperties {
  return {
    display: "grid",
    placeItems: "center",
    flex: "0 0 auto",
    width: 36,
    height: 36,
    borderRadius: 10,
    background: accent + "1f",
    color: accent,
  };
}

const channelLabelStyle: CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  opacity: 0.6,
};

const channelValueStyle: CSSProperties = {
  display: "block",
  font: "700 14px/1.3 'DM Sans',sans-serif",
};

const copyBtnStyle: CSSProperties = {
  marginLeft: "auto",
  flex: "0 0 auto",
  display: "grid",
  placeItems: "center",
  width: 30,
  height: 30,
  borderRadius: 8,
  cursor: "pointer",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "inherit",
};

const statusPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 10,
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  background: "rgba(34,197,94,.14)",
  color: "#22c55e",
};

function CopyButton(props: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(props.text).then(function () {
        setCopied(true);
        window.setTimeout(function () {
          setCopied(false);
        }, 1600);
      }).catch(function () {});
    }
  }

  return (
    <button
      type="button"
      aria-label={"Copy " + props.label}
      title={"Copy " + props.label}
      style={copyBtnStyle}
      onClick={handleClick}
    >
      {copied ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
    </button>
  );
}

type ChannelRowProps = {
  href: string;
  accent: string;
  icon: ReactNode;
  label: string;
  value: string;
  note?: string;
  external?: boolean;
  copyValue?: string;
};

function ChannelRow(props: ChannelRowProps) {
  function handleEnter(e: MouseEvent<HTMLAnchorElement>) {
    e.currentTarget.style.transform = "translateX(3px)";
  }
  function handleLeave(e: MouseEvent<HTMLAnchorElement>) {
    e.currentTarget.style.transform = "translateX(0)";
  }

  const extraProps = props.external ? { target: "_blank", rel: "noreferrer" } : {};

  return (
    <a
      href={props.href}
      {...extraProps}
      style={getChannelCardStyle(props.accent)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <span style={getChannelIconStyle(props.accent)}>{props.icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={channelLabelStyle}>{props.label}</span>
        <span style={channelValueStyle}>{props.value}</span>
        {props.note ? (
          <span style={{ display: "block", fontSize: 11, opacity: 0.55, marginTop: 2 }}>
            {props.note}
          </span>
        ) : null}
      </span>
      {props.copyValue ? <CopyButton text={props.copyValue} label={props.label} /> : null}
    </a>
  );
}

function FaqAccordion(props: { items: typeof FAQS; query: string }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  if (props.items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "26px 10px" }}>
        <Search size={26} style={{ opacity: 0.35 }} />
        <p className="muted" style={{ marginTop: 10 }}>
          No answers matched {props.query ? "\"" + props.query + "\"" : "that filter"}.
        </p>
        <a
          className="gold-button"
          href={waHref("Hi HotBet support, I need help with: " + props.query)}
          target="_blank"
          rel="noreferrer"
          style={{ marginTop: 12, display: "inline-flex" }}
        >
          <MessageCircle size={15} /> Ask us on WhatsApp
        </a>
      </div>
    );
  }

  return (
    <div className="faq-list">
      {props.items.map(function (item, i) {
        const open = openIdx === i;
        const itemClass = open ? "faq-item open" : "faq-item";

        function toggle() {
          setOpenIdx(open ? null : i);
        }

        return (
          <div className={itemClass} key={item.q}>
            <button className="faq-q" type="button" aria-expanded={open} onClick={toggle}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
                <span
                  style={{
                    flex: "0 0 auto",
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    padding: "3px 7px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,.07)",
                    opacity: 0.7,
                  }}
                >
                  {item.category}
                </span>
                {item.q}
              </span>
              <span
                className="faq-chevron"
                style={{
                  transition: "transform .2s ease",
                  transform: open ? "rotate(180deg)" : "none",
                  display: "inline-flex",
                }}
              >
                <ChevronDown size={16} />
              </span>
            </button>
            {open ? <p className="faq-a">{item.a}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export default function SupportCenter() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const counts = useMemo(function () {
    const map: Record<string, number> = { All: FAQS.length };
    FAQS.forEach(function (f) {
      map[f.category] = (map[f.category] || 0) + 1;
    });
    return map;
  }, []);

  const categories = ["All"].concat(Array.from(new Set(FAQS.map(function (f) { return f.category; }))));

  const filtered = useMemo(function () {
    const q = query.trim().toLowerCase();
    return FAQS.filter(function (f) {
      const categoryMatches = category === "All" || f.category === category;
      const queryMatches = q === "" || f.q.toLowerCase().indexOf(q) !== -1 || f.a.toLowerCase().indexOf(q) !== -1;
      return categoryMatches && queryMatches;
    });
  }, [query, category]);

  const [ticket, setTicket] = useState({ subject: "", message: "" });

  const mailtoHref =
    "mailto:" + SUPPORT.email +
    "?subject=" + encodeURIComponent(ticket.subject || "Support request") +
    "&body=" + encodeURIComponent(ticket.message);

  const ticketWaText =
    "Hi HotBet support.\n" +
    (ticket.subject ? "Subject: " + ticket.subject + "\n" : "") +
    (ticket.message || "");
  const ticketWaHref = waHref(ticketWaText.trim());

  function handleSubjectChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setTicket(function (t) {
      return { subject: v, message: t.message };
    });
  }

  function handleMessageChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setTicket(function (t) {
      return { subject: t.subject, message: v };
    });
  }

  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
  }

  return (
    <div className="support-wrap">
      <section className="panel simple-card support-search-card">
        <span style={statusPillStyle}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
          Support online · replies in minutes
        </span>
        <Headphones size={24} />
        <h2>How can we help?</h2>
        <p>Search common questions about deposits, withdrawals, betting, and your account — or message our team on WhatsApp or Telegram.</p>

        <label className="search-box support-search" style={{ position: "relative" }}>
          <Search size={15} />
          <input
            placeholder="Search the help centre…"
            value={query}
            onChange={function (e) { setQuery(e.target.value); }}
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={function () { setQuery(""); }}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "inherit",
                opacity: 0.6,
                display: "flex",
              }}
            >
              <X size={14} />
            </button>
          ) : null}
        </label>

        <div className="casino-tabs support-cats">
          {categories.map(function (c) {
            return (
              <button
                key={c}
                className={category === c ? "active" : ""}
                onClick={function () { setCategory(c); }}
                type="button"
              >
                {c} <span style={{ opacity: 0.5, fontSize: 11 }}>{counts[c] || 0}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginTop: 16 }}>
          <ChannelRow
            href={waHref("Hi HotBet support, I need help with my account.")}
            accent={WA_ACCENT}
            external={true}
            icon={<MessageCircle size={17} />}
            label="WhatsApp"
            value={SUPPORT.phoneDisplay}
            note="Fastest — tap to chat"
            copyValue={SUPPORT.phoneLocal}
          />
          <ChannelRow
            href={SUPPORT.telegramUrl}
            accent={TG_ACCENT}
            external={true}
            icon={<Send size={17} />}
            label="Telegram"
            value={SUPPORT.telegramHandle}
            note="Chat with an agent"
            copyValue={SUPPORT.telegramHandle}
          />
        </div>
      </section>

      <div className="simple-grid support-grid">
        <section className="panel simple-card">
          <div className="module-title" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <h3>Frequently asked questions</h3>
            <span className="muted" style={{ fontSize: 11 }}>
              {filtered.length} of {FAQS.length}
            </span>
          </div>
          <FaqAccordion items={filtered} query={query.trim()} />
        </section>

        <div className="support-side">
          <section className="panel simple-card support-contact-card">
            <MessageCircle size={22} />
            <h3>Contact support</h3>
            <p>WhatsApp and Telegram are answered fastest. Email is best for documents and account reviews.</p>

            <div className="support-channels" style={{ display: "grid", gap: 8 }}>
              <ChannelRow
                href={waHref("Hi HotBet support, I need help with my account.")}
                accent={WA_ACCENT}
                external={true}
                icon={<MessageCircle size={17} />}
                label="WhatsApp"
                value={SUPPORT.phoneDisplay}
                copyValue={SUPPORT.phoneLocal}
              />
              <ChannelRow
                href={SUPPORT.telegramUrl}
                accent={TG_ACCENT}
                external={true}
                icon={<Send size={17} />}
                label="Telegram"
                value={SUPPORT.telegramHandle}
                copyValue={SUPPORT.telegramHandle}
              />
              <ChannelRow
                href={"tel:" + SUPPORT.phoneLocal}
                accent={WA_ACCENT}
                icon={<Phone size={17} />}
                label="Call us"
                value={SUPPORT.phoneDisplay}
                copyValue={SUPPORT.phoneLocal}
              />
              <ChannelRow
                href={"mailto:" + SUPPORT.email}
                accent={MAIL_ACCENT}
                icon={<Mail size={17} />}
                label="Email"
                value={SUPPORT.email}
                copyValue={SUPPORT.email}
              />
            </div>

            <span className="support-channel muted" style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 12, fontSize: 12 }}>
              <Clock3 size={14} /> Live chat: 24/7
            </span>
          </section>

          <section className="panel simple-card">
            <h3>Send us a message</h3>
            <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
              Write it once, then send it by email or straight to WhatsApp.
            </p>
            <form className="deposit-form" onSubmit={handleFormSubmit}>
              <label className="auth-field">
                <span>Subject</span>
                <input
                  value={ticket.subject}
                  onChange={handleSubjectChange}
                  placeholder="e.g. Deposit not credited"
                />
              </label>
              <label className="auth-field">
                <span>Message</span>
                <textarea
                  rows={4}
                  value={ticket.message}
                  onChange={handleMessageChange}
                  placeholder="Describe what happened, including any reference numbers"
                  style={{
                    width: "100%",
                    padding: 12,
                    background: "#f7f8fa",
                    border: "1px solid #dde1e7",
                    borderRadius: 10,
                    font: "500 14px 'DM Sans',sans-serif",
                    color: "#20232c",
                    resize: "vertical",
                  }}
                />
                <small className="muted" style={{ fontSize: 11 }}>
                  {ticket.message.length} characters
                </small>
              </label>

              <div style={{ display: "grid", gap: 8 }}>
                <a
                  className="gold-button full"
                  href={ticketWaHref}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textAlign: "center", justifyContent: "center" }}
                >
                  <MessageCircle size={15} /> Send on WhatsApp
                </a>
                <a
                  className="ghost-button"
                  href={mailtoHref}
                  style={{ textAlign: "center", justifyContent: "center", display: "flex", alignItems: "center", gap: 8 }}
                >
                  <Mail size={15} /> Send via email
                </a>
              </div>
            </form>
          </section>

          <section className="panel simple-card">
            <ShieldCheck size={22} />
            <h3>Self-service</h3>
            <p>Fastest way to resolve most issues:</p>
            <div className="support-quicklinks">
              <Link href="/wallet">
                <WalletCards size={13} /> Check wallet &amp; transaction history
              </Link>
              <Link href="/bets">
                <Clock3 size={13} /> View bet history
              </Link>
              <Link href="/deposit">
                <Mail size={13} /> Make a new deposit
              </Link>
              <Link href="/responsible-gaming">
                <ShieldCheck size={13} /> Set account limits
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}