import { SITE } from '@/lib/site';
import { CallButton, PublicPage, WhatsAppButton } from '@/components/public';

export const metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <PublicPage>
      <section className="pb-12 pt-8 md:pt-14">
        <h1 className="text-3xl font-extrabold text-stone-900 md:text-4xl">Contact</h1>
        <p className="mt-2 text-stone-600">The fastest way to reach us is WhatsApp.</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <WhatsAppButton label="Message us on WhatsApp" message="Hello Lawmann, I would like to book a laundry wash." />
          <CallButton />
        </div>

        <div className="mt-10 space-y-1.5 text-sm text-stone-700">
          <p>
            <span className="font-semibold">Shop: </span>
            the Lawmann Store, on campus at Legon
          </p>
          <p>
            <span className="font-semibold">Hours: </span>
            {SITE.hours}
          </p>
        </div>
      </section>
    </PublicPage>
  );
}
