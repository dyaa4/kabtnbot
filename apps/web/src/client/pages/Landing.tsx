import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { LandingHeader } from '../components/landing/LandingHeader.js';
import { Hero } from '../components/landing/Hero.js';
import { Features } from '../components/landing/Features.js';
import { HowItWorks } from '../components/landing/HowItWorks.js';
import { Pricing } from '../components/landing/Pricing.js';
import { Faq } from '../components/landing/Faq.js';
import { CtaBand } from '../components/landing/CtaBand.js';
import { LandingFooter } from '../components/landing/LandingFooter.js';

interface Meta {
  clientId: string;
  inviteUrl: string;
  guilds?: number;
}

export function Landing() {
  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/api/meta') });
  const inviteUrl = meta.data?.inviteUrl ?? '#';

  return (
    <div className="min-h-screen">
      <LandingHeader />
      <Hero inviteUrl={inviteUrl} guilds={meta.data?.guilds ?? 0} />
      <Features />
      <HowItWorks inviteUrl={inviteUrl} />
      <Pricing inviteUrl={inviteUrl} />
      <Faq />
      <CtaBand inviteUrl={inviteUrl} />
      <LandingFooter />
    </div>
  );
}
