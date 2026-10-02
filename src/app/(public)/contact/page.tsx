import { SITE } from '@/lib/site';
import { CallButton, Kicker, PublicPage, Section, WhatsAppButton } from '@/components/public';
import { ClockIcon, MapPinIcon } from '@/components/icons';

export const metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <PublicPage>
      <Section>
        <Kicker>Contact</Kicker>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-forest md:text-6xl">
          The fastest way is <span className="italic">WhatsApp</span>
        </h1>
        <p className="mt-4 max-w-lg text-lg text-forest/70">
          Message us and we reply during shop hours. A call works too.
        </p>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-8 shadow-soft">
            <h2 className="font-display text-2xl font-semibold text-forest">Message or call</h2>
            <p className="mt-2 text-sm text-forest/70">
              WhatsApp {SITE.displayPhone} — the customer-facing line.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <WhatsAppButton
                label="Message us"
                message="Hello Lawmann, I would like to book a laundry wash."
              />
              <CallButton />
            </div>
          </div>

          <div className="rounded-3xl bg-white p-8 shadow-soft">
            <h2 className="font-display text-2xl font-semibold text-forest">The shop</h2>
            <ul className="mt-4 space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-soft">
                  <MapPinIcon className="h-5 w-5 text-sage-deep" />
                </span>
                <span className="text-sm leading-snug text-forest/80">
                  The Lawmann Store, on campus at Legon
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-soft">
                  <ClockIcon className="h-5 w-5 text-sage-deep" />
                </span>
                <span className="text-sm leading-snug text-forest/80">{SITE.hours}</span>
              </li>
            </ul>
          </div>
        </div>
      </Section>
    </PublicPage>
  );
}
