import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  Radio,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import './LoginForm.css';

function getCATTime() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kigali',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

function LoginForm({ onSubmit, submitting, error }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [catTime, setCatTime] = useState(getCATTime);
  const [portraitUnavailable, setPortraitUnavailable] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setCatTime(getCATTime()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(username.trim(), password);
  }

  return (
    <main className="mipc-login">
      <div className="mipc-login__grid" aria-hidden="true" />
      <div className="mipc-login__orb mipc-login__orb--cyan" aria-hidden="true" />
      <div className="mipc-login__orb mipc-login__orb--gold" aria-hidden="true" />

      <header className="mipc-header">
        <a className="mipc-brand" href="/" aria-label="MIPC Digital EDU home">
          <img alt="MIPC logo" className="mipc-brand__logo" src="/logo.jpg" />
          <span className="mipc-brand__name">
            <strong>MUHABURA INTEGRATED</strong>
            <span>POLYTECHNIC COLLEGE <b>(MIPC)</b></span>
          </span>
        </a>

        <div className="mipc-header__status">
          <div className="mipc-clock">
            <span className="mipc-clock__label"><span className="mipc-live-dot" /> LOCAL SYSTEM TIME</span>
            <time className="mipc-clock__time">{catTime}</time>
            <span className="mipc-clock__zone">CENTRAL AFRICA TIME · CAT</span>
          </div>
          <div className="mipc-portal-tag">
            <ShieldCheck size={15} />
            <span>ADMINISTRATOR PORTAL</span>
          </div>
        </div>
      </header>

      <section className="mipc-console" aria-labelledby="login-title">
        <div className="mipc-console__topline">
          <span><i /> SECURE ACCESS TERMINAL</span>
          <span className="mipc-console__serial">MIPC / EDU / 01</span>
        </div>

        <div className="mipc-console__content">
          <section className="mipc-profile" aria-label="Administrator identity">
            <div className="mipc-profile__eyebrow">
              <span className="mipc-profile__line" />
              INSTITUTIONAL AUTHORITY
            </div>

            <div className="mipc-hex">
              <div className="mipc-hex__inner">
                {!portraitUnavailable && (
                  <img
                    alt="Headmaster"
                    className="mipc-hex__portrait"
                    onError={() => setPortraitUnavailable(true)}
                    src="/headmaster.jpg"
                  />
                )}
                {portraitUnavailable && (
                  <div className="mipc-hex__fallback" aria-label="Headmaster portrait unavailable">
                    <span>MIPC</span>
                    <UserRound size={55} strokeWidth={1.1} />
                    <small>HEADMASTER</small>
                  </div>
                )}
                <div className="mipc-hex__scan" aria-hidden="true" />
              </div>
              <span className="mipc-hex__corner mipc-hex__corner--one" />
              <span className="mipc-hex__corner mipc-hex__corner--two" />
              <span className="mipc-hex__corner mipc-hex__corner--three" />
              <span className="mipc-hex__corner mipc-hex__corner--four" />
            </div>

            <div className="mipc-profile__identity">
              <span className="mipc-profile__online"><i /> IDENTITY NODE READY</span>
              <h2>HEADMASTER</h2>
              <p>LEADERSHIP ACCESS POINT</p>
            </div>

            <div className="mipc-profile__coordinates">
              <span>INSTITUTION <b>MIPC-EDU</b></span>
              <span>ACCESS LEVEL <b>RESTRICTED</b></span>
            </div>
          </section>

          <div className="mipc-divider" aria-hidden="true"><span /></div>

          <section className="mipc-auth">
            <div className="mipc-auth__heading">
              <div className="mipc-auth__eyebrow"><span>01</span> AUTHENTICATE IDENTITY</div>
              <h1 id="login-title">Command <em>access.</em></h1>
              <p>Sign in with your authorized institutional credentials.</p>
            </div>

            <form className="mipc-form" onSubmit={handleSubmit}>
              <div className="mipc-field">
                <label htmlFor="username">USERNAME <span>(OR MIPC ID)</span></label>
                <div className="mipc-field__control">
                  <UserRound size={18} aria-hidden="true" />
                  <input
                    autoComplete="username"
                    autoCapitalize="none"
                    id="username"
                    name="username"
                    onChange={event => setUsername(event.target.value)}
                    placeholder="Enter your username or MIPC ID"
                    required
                    type="text"
                    value={username}
                  />
                  <span className="mipc-field__index">01</span>
                </div>
              </div>

              <div className="mipc-field">
                <label htmlFor="password">PASSWORD</label>
                <div className="mipc-field__control">
                  <LockKeyhole size={18} aria-hidden="true" />
                  <input
                    autoComplete="current-password"
                    id="password"
                    name="password"
                    onChange={event => setPassword(event.target.value)}
                    placeholder="Enter your secure password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                  />
                  <button
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="mipc-password-toggle"
                    onClick={() => setShowPassword(value => !value)}
                    type="button"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="mipc-form__error" role="alert">
                  <ShieldCheck size={16} />
                  {error}
                </p>
              )}

              <button className="mipc-submit" disabled={submitting} type="submit">
                <span className="mipc-submit__icon"><KeyRound size={18} /></span>
                <span>{submitting ? 'VERIFYING CREDENTIALS…' : 'SECURE ADMINISTRATOR LOG IN'}</span>
                {!submitting && <ArrowUpRight className="mipc-submit__arrow" size={18} />}
              </button>
            </form>

            <div className="mipc-auth__assurance">
              <Fingerprint size={16} />
              <span>ENCRYPTED SESSION</span>
              <i />
              <span>AUTHORIZED PERSONNEL ONLY</span>
            </div>
          </section>

          <aside className="mipc-metrics" aria-label="Live system status">
            <div className="mipc-metrics__heading">
              <span>SYSTEM TELEMETRY</span>
              <Activity size={15} />
            </div>
            <div className="mipc-metric">
              <div className="mipc-metric__label"><span><Radio size={13} /> PASSWORD STORAGE</span><b className="mipc-state--live">ACTIVE</b></div>
              <div className="mipc-metric__value">BCRYPT <small>HASHED</small></div>
              <div className="mipc-meter"><i style={{ width: '100%' }} /></div>
            </div>
            <div className="mipc-metric">
              <div className="mipc-metric__label"><span><LockKeyhole size={13} /> SESSION TOKEN</span><b className="mipc-state--secure">PROTECTED</b></div>
              <div className="mipc-metric__value mipc-metric__value--small">SHA-256 <small>HASHED</small></div>
              <div className="mipc-encryption"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
            </div>
            <div className="mipc-metric mipc-metric--last">
              <div className="mipc-metric__label"><span><ShieldCheck size={13} /> ACCESS CONTROL</span><b className="mipc-state--secure">ENFORCED</b></div>
              <div className="mipc-shield-status"><span className="mipc-live-dot" /> ROLE-BASED ACCESS</div>
            </div>
            <div className="mipc-metrics__foot">SECURITY PROTOCOL <b>EDU-SHIELD v2.4</b></div>
          </aside>
        </div>

        <div className="mipc-console__bottom">
          <span><i /> CONNECTION SECURE</span>
          <span>AUTHORIZED ACCESS ONLY</span>
          <span>© MIPC DIGITAL EDU</span>
        </div>
      </section>

      <footer className="mipc-footer">
        <span>MUHABURA INTEGRATED POLYTECHNIC COLLEGE</span>
        <span>LEARN · LEAD · BUILD THE FUTURE</span>
      </footer>
      <p className="mipc-register-link">
        Don&apos;t have an account? <Link to="/register">Create Account / Register</Link>
      </p>
    </main>
  );
}

export default LoginForm;
