import Header from '../components/web1/Header';
import Hero from '../components/web1/Hero';
import OverviewSection from '../components/web1/OverviewSection';
import DashboardSection from '../components/web1/DashboardSection';
import Footer from '../components/web1/Footer';

export default function HomePage() {
  return (
    <div id="top" className="min-h-screen bg-[#060608] text-white selection:bg-purple-500 selection:text-white flex flex-col justify-between font-sans relative">
      <Header />
      <main id="main" tabIndex={-1} className="flex flex-col flex-1 focus:outline-none">
        <Hero />
        <OverviewSection />
        <DashboardSection />
      </main>
      <Footer />
    </div>
  );
}
