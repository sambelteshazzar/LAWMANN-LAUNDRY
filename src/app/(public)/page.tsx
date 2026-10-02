import Link from 'next/link';
import { BANDS } from '@/lib/pricing';
import { moneyShort } from '@/lib/money';
import { AREAS, SITE } from '@/lib/site';
import { CallButton, FoldLine, PhotoPlaceholder, PublicPage, WhatsAppButton } from '@/components/public';

export const metadata = { title: { absolute: 'Lawmann Laundry | Campus laundry at Legon' } };

const STEPS = [
  { title: 'Message us', body: 'Send a WhatsApp message or call to arrange your wash.' },
  {
    title: 'Weighed, not estimated',
    body: 'Your bag goes on the scale and the price follows the kilo, straight from the shop tariff.',
  },
  {
    title: 'Texted at every step',
    body: 'An SMS when your bag is accepted and another the moment it is ready.',
  },
  { title: 'Pay your way', body: 'MoMo or cash at collection, with a receipt that splits every tax.' },
];

export default function LandingPage() {
  return (
    <PublicPage>
      <section className="pb-10 pt-8 md:pt-14">
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

      <section className="pb-10">
        <FoldLine />
        <h2 className="pt-8 text-2xl font-bold text-stone-900">How it works</h2>
        <ol className="mt-6 space-y-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="shrink-0 text-xl font-extrabold tabular-nums text-teal-800">{i + 1}</span>
              <div>
                <h3 className="font-bold text-stone-900">{step.title}</h3>
                <p className="mt-1 max-w-lg text-sm text-stone-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="pb-10">
        <FoldLine />
        <div className="pt-8">
          <h2 className="text-2xl font-bold text-stone-900">Bags from {moneyShort(BANDS[0]!.price)}</h2>
          <p className="mt-2 max-w-lg text-stone-600">
            Washed by the kilo, or priced by the piece. The full tariff is one tap away.
          </p>
          <Link
            href="/pricing"
            className="mt-4 inline-flex min-h-12 items-center text-sm font-semibold text-teal-800 underline"
          >
            See the full price list
          </Link>
        </div>
      </section>

      <section className="pb-10">
        <FoldLine />
        <div className="pt-8">
          <h2 className="text-2xl font-bold text-stone-900">Where we collect</h2>
          <p className="mt-2 max-w-lg text-stone-600">Across the University of Ghana campus:</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {AREAS.map((area) => (
              <li key={area} className="rounded-md bg-stone-100 px-3 py-1.5 text-sm text-stone-700">
                {area}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="pb-10">
        <FoldLine />
        <div className="pt-8">
          <h2 className="text-2xl font-bold text-stone-900">Why Lawmann</h2>
          <dl className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <dt className="font-bold text-stone-900">Weighed by the kilo</dt>
              <dd className="mt-1 text-sm text-stone-600">
                The scale decides the price. Every bag is weighed and billed by the kilo.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-stone-900">SMS at every step</dt>
              <dd className="mt-1 text-sm text-stone-600">
                A text when your bag is accepted and another the moment it is ready.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-stone-900">Receipts that add up</dt>
              <dd className="mt-1 text-sm text-stone-600">
                Every receipt splits VAT, NHIL and the GETFund levy, the GRA way.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-stone-900">MoMo or cash</dt>
              <dd className="mt-1 text-sm text-stone-600">Pay by mobile money or cash at collection, your choice.</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="pb-14">
        <FoldLine />
        <div className="pt-10 text-center">
          <h2 className="text-2xl font-bold text-stone-900">Ready when you are</h2>
          <p className="mx-auto mt-2 max-w-md text-stone-600">{SITE.hours}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <WhatsAppButton label="Message us on WhatsApp" message="Hello Lawmann, I would like to book a laundry wash." />
            <CallButton />
          </div>
        </div>
      </section>
    </PublicPage>
  );
}
