import "./start.css";

/**
 * Log in with PayPal, per PayPal's designer guide: PayPal's own button image, served by PayPal (never a copy here).
 * A plain <a>: it starts a redirect and sets a cookie, so it must never be prefetched.
 */
export function PaypalLoginButton() {
  return (
    <a className="pp-login" href="/g/login/paypal">
      {/* eslint-disable-next-line @next/next/no-img-element -- PayPal's official button, by URL, as their guide asks */}
      <img src="https://www.paypalobjects.com/devdoc/log-in-with-paypal-button.png" alt="Log in with PayPal" width={211} height={48} />
    </a>
  );
}
