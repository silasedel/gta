(() => {
  const d = window.design,
    T = window.THREE,
    errs = [];
  let n = 0;
  const t = (label, fn) => {
    try {
      const r = fn();
      if (r == null) errs.push(label + ': null');
      n++;
    } catch (e) {
      errs.push(label + ': ' + e.message);
    }
  };
  for (const b of d.brands) {
    t('logo ' + b.id, () => b.logoCanvas(128));
    t('pattern ' + b.id, () => b.patternCanvas(64));
    for (const k of ['poster', 'menu', 'flyer', 'sticker', 'plateFrame', 'livery', 'bag', 'cup'])
      t(k + ' ' + b.id, () =>
        d.print[k](b, k === 'poster' || k === 'menu' ? { w: 256, h: 320 } : {}),
      );
    t('receipt ' + b.id, () => d.print.receipt(b, ['hot-dog-mustard', { name: 'Test', price: 2 }]));
  }
  for (const b of d.brands.filter((x) => x.storefront))
    t('sign ' + b.id, () => d.signs.build(T, b, { width: 2 }).group);
  for (const s of d.signs.types)
    t('signstyle ' + s, () => d.signs.build(T, d.getBrand('egret'), { style: s }).group);
  t('billboard', () => d.signs.billboard(T, d.getBrand('meridian-cola')).group);
  t('wide poster', () => d.print.poster(d.getBrand('riptide'), { w: 1024, h: 300 }));
  t('shoppingBag', () => d.signs.shoppingBag(T, d.getBrand('vauclere')));
  for (const p of d.products) {
    t('product ' + p.id, () => d.buildProduct(T, p.id));
    t('open ' + p.id, () => d.buildProduct(T, p.id, { state: 'open', sip: 1 }));
    if (p.bites > 1) t('bite ' + p.id, () => d.buildProduct(T, p.id, { bite: 1 }));
    t('tag ' + p.id, () => d.print.priceTag(p));
    t('label ' + p.id, () => d.print.label(p));
    t('parts ' + p.id, () => d.productParts(T, p.id).length || null);
  }
  for (const m of d.materials.names())
    t('mat ' + m, () => d.materials.get(T, m, { size: 64, wear: 0.5 }));
  for (const k of Object.keys(d.styleguide.districts))
    t('district ' + k, () => d.styleguide.district(k));
  t('forBrand', () => d.styleguide.forBrand(d.getBrand('egret'), 'little-havana'));
  t('pick', () => d.pickBrand(5, { category: 'fuel', district: 'tern-key' }));
  t('family', () => d.pickFamily(3, 'elevator'));
  return JSON.stringify({
    checks: n,
    failed: errs.length,
    errs: errs.slice(0, 25),
    families: d.families.length,
    kinds: d.familyKinds.length,
  });
})();
