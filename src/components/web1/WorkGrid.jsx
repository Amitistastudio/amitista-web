import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import ResponsiveImage from '../ResponsiveImage';
import { PROJECTS } from '../../content/projects';

const LAYOUT = {
  1: { columns: 'grid-cols-1', width: 'max-w-xl' },
  2: { columns: 'grid-cols-1 sm:grid-cols-2', width: 'max-w-4xl' },
  3: { columns: 'grid-cols-1 md:grid-cols-3', width: 'max-w-none' },
};

function ProjectCard({ project, index, eager = false }) {
  return (
    <a
      href={`/work/${project.slug}`}
      className="flex flex-col items-start text-left group"
    >
      <div className="relative w-full aspect-[3/2] overflow-hidden rounded-none mb-6 bg-[#0a0a0d]">
        <ResponsiveImage
          src={project.cover}
          alt={`${project.name} — ${project.kind}`}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager && index === 0 ? 'high' : undefined}
          decoding="async"
          sizes="(min-width: 768px) 480px, (min-width: 640px) 50vw, 100vw"
          pictureClassName="block w-full h-full"
          className="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-500"
        />
      </div>
      <div className="px-6 md:px-8 w-full flex flex-col items-start">
        <span className="text-xs font-semibold text-muted tracking-wider mb-2 select-none">
          {String(index + 1).padStart(3, '0')}
        </span>
        <h3 className="text-2xl sm:text-[28px] font-medium text-white mb-3 tracking-tight leading-tight">
          {project.name}
        </h3>
        <p className="text-sm sm:text-[15px] text-neutral-400 font-normal leading-relaxed">
          {project.summary}
        </p>
        <span className="inline-flex items-center gap-1.5 mt-5 text-[11px] font-semibold text-muted tracking-[0.2em] group-hover:text-white transition-colors duration-300">
          VIEW PROJECT
          <ArrowUpRight
            size={12}
            strokeWidth={2}
            className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300"
          />
        </span>
      </div>
    </a>
  );
}

export default function WorkGrid({ id, aboveTheFold = false }) {
  if (PROJECTS.length === 0) return null;

  const layout = LAYOUT[PROJECTS.length] ?? LAYOUT[3];

  const eagerUpTo = aboveTheFold ? 3 : 0;

  return (
    <div
      id={id}
      className="relative z-30 w-full px-6 sm:px-10 md:px-0 pb-24 scroll-mt-20 flex justify-center"
    >
      <div className={`grid ${layout.columns} gap-8 w-full ${layout.width}`}>
        {PROJECTS.map((project, index) => (
          <ProjectCard
            key={project.slug}
            project={project}
            index={index}
            eager={index < eagerUpTo}
          />
        ))}
      </div>
    </div>
  );
}
