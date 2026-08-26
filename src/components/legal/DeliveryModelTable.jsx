import React from 'react';
import { DELIVERY_MODELS } from '../../content/deliveryModels';

export default function DeliveryModelTable() {
  return (
    <div className="border border-[#282832] mt-2">
      {DELIVERY_MODELS.map((model, index) => (
        <div
          key={model.key}
          className={`p-5 bg-[#0a0a0d] flex flex-col gap-3 ${
            index > 0 ? 'border-t border-[#1c1c22]' : ''
          }`}
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-white leading-snug">{model.name}</span>
            <span className="text-[13px] text-neutral-300 font-normal leading-relaxed">
              {model.tagline}
            </span>
          </div>

          <p className="text-sm text-neutral-400 font-normal leading-relaxed">{model.body}</p>

          <dl className="flex flex-col gap-1.5 border-t border-[#1c1c22] pt-3">
            {model.facts.map(([label, value]) => (
              <div
                key={label}
                className="flex flex-col sm:flex-row sm:gap-4 gap-0.5 font-tech text-[11px] leading-relaxed"
              >
                <dt className="text-muted sm:w-[104px] sm:shrink-0">{label}</dt>
                <dd className="text-neutral-400">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
