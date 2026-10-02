import { CallButton, PhotoPlaceholder, PublicPage, WhatsAppButton } from '@/components/public';

export const metadata = { title: { absolute: 'Lawmann Laundry | Campus laundry at Legon' } };

export default function LandingPage() {
  return (
    <PublicPage>
      <section className="pb-12 pt-8 md:pt-14">
        <h1 className="max-w-xl text-4xl font-extrabold leading-tight text-stone-900 md:text-5xl">
          Your laundry, weighed and washed.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-stone-600">
          Lawmann washes by the kilo, not by estimate, and texts you at every step.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <WhatsAppButton label="Message us on WhatsApp" message="Hello Lawmann, I would like to book a laundry wash." />
          <CallButton />
        </div>
        <div className="mt-10">
          <PhotoPlaceholder hint="Real photo of the shop goes here (owner to provide)" />
        </div>
      </section>
    </PublicPage>
  );
}
