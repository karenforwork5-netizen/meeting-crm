/* Job-to-CV matching engine — pure functions, no DOM/fetch access.
 * Loaded as a plain <script> in the browser (attaches to window) and can be
 * required directly under plain Node for testing, same pattern as kai-engine.js.
 *
 * Deterministic only: no AI model, no external API, no network access.
 * Every result is derived strictly from the job's own stored fields and the
 * user's own stored Job Profile — nothing here invents a skill, a tool, or
 * a year of experience that isn't actually present in that data.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const STOPWORDS = new Set(['and', 'or', 'the', 'a', 'an', 'for', 'with', 'of', 'to', 'in', 'on', 'at', 'is', 'are', 'your', 'you', 'our', 'we',
    'position', 'role', 'job', 'opportunity', 'needed', 'wanted', 'looking']);

  // Known wording variations treated as equivalent. Each inner array is one
  // equivalence group; every phrase in a group canonicalizes to group[0].
  const SYNONYM_GROUPS = [
    ['appointment setting', 'appointment setter', 'appointment setters'],
    ['customer service', 'customer support', 'customer care'],
    ['crm management', 'crm experience', 'crm management experience', 'client relationship management'],
    ['cold calling', 'outbound calling', 'cold caller'],
    ['lead follow-up', 'lead follow up', 'follow-up management', 'follow up management'],
    ['workflow automation', 'automation workflows', 'process automation'],
    ['lead generation', 'lead gen'],
    ['data entry', 'data-entry'],
    ['sales support', 'sales assistance'],
    ['process optimization', 'process improvement'],
    ['ai & automation', 'ai and automation', 'ai automation'],
    ['crm setup & automation', 'crm setup and automation', 'crm setup automation'],
  ];

  // Common job-title patterns and the capabilities they typically involve.
  // These are only ever used as CANDIDATE signals to test against the user's
  // actual Job Profile — a title never adds a "match" or a "gap" by itself;
  // it just proposes what to look for, exactly like a job-authored skill would.
  const TITLE_CAPABILITY_HINTS = [
    { pattern: /appointment sett/i, capabilities: ['Appointment Setting', 'Cold Calling', 'Lead Follow-Up', 'Customer Support', 'CRM Management'] },
    { pattern: /sales rep|sales representative|account executive|sales consultant|sales associate/i, capabilities: ['Sales Support', 'Customer Service', 'Lead Generation', 'Cold Calling', 'CRM Management', 'Client Relationship Management'] },
    { pattern: /customer (service|support|care)/i, capabilities: ['Customer Support', 'Customer Service'] },
    { pattern: /virtual assistant/i, capabilities: ['Customer Support', 'Appointment Setting', 'Data Entry', 'CRM Management'] },
    { pattern: /telemarket|telesales|cold call/i, capabilities: ['Cold Calling', 'Sales Support'] },
    { pattern: /lead gen/i, capabilities: ['Lead Generation', 'Data Entry'] },
    { pattern: /data entry/i, capabilities: ['Data Entry'] },
    { pattern: /crm/i, capabilities: ['CRM Management', 'CRM Setup & Automation'] },
    { pattern: /automation/i, capabilities: ['Workflow Automation', 'AI & Automation', 'Process Optimization'] },
    { pattern: /recruiter/i, capabilities: ['Lead Generation', 'Cold Calling'] },
    { pattern: /admin(istrative)?/i, capabilities: ['Data Entry', 'Customer Support'] },
  ];

  // Recognized CRM/automation tool names. Used only to detect that a job
  // requirement is naming a specific platform, so a missing platform can be
  // reported as a real gap instead of silently ignored.
  const KNOWN_TOOLS = ['zoho', 'smart moving', 'n8n', 'zapier', 'make.com', 'hubspot', 'salesforce', 'pipedrive',
    'gohighlevel', 'go high level', 'activecampaign', 'keap', 'insightly', 'freshsales', 'copper', 'monday.com', 'airtable'];

  function normalize(s) {
    return (s || '').toLowerCase().trim().replace(/[.,;:!?()]/g, '').replace(/\s+/g, ' ');
  }
  function canonicalPhrase(s) {
    const n = normalize(s);
    for (const group of SYNONYM_GROUPS) {
      if (group.some(g => normalize(g) === n)) return normalize(group[0]);
    }
    return n;
  }
  function tokenize(s) {
    return normalize(s).split(/[^a-z0-9.]+/).filter(Boolean).filter(w => !STOPWORDS.has(w));
  }
  function jaccard(a, b) {
    if (!a.length || !b.length) return 0;
    const setA = new Set(a), setB = new Set(b);
    let inter = 0;
    setA.forEach(t => { if (setB.has(t)) inter++; });
    const union = new Set([...setA, ...setB]).size;
    return union ? inter / union : 0;
  }
  // Coverage (not Jaccard): what fraction of the JOB's own tokens are found
  // somewhere in the profile's experience text. A short job title (2-3 words)
  // compared against a huge resume via Jaccard is unfairly punished by the
  // resume's sheer size — coverage instead asks the right question: "does the
  // profile's stated experience actually cover what this job is about?"
  function coverage(jobTokens, profileTokenSet) {
    if (!jobTokens.length) return null;
    const present = jobTokens.filter(t => profileTokenSet.has(t)).length;
    return (present / jobTokens.length) * 100;
  }

  // True when every token of the shorter phrase appears in the longer one —
  // i.e. the shorter phrase is literally named as part of the longer one
  // (e.g. "Cold Calling" fully contained in "Appointment Setting & Cold
  // Calling"). Guarded to phrases of 2+ tokens so a single ambiguous word
  // (e.g. "Sales", "CRM") can never trigger this on its own — that stays
  // governed by the stricter Jaccard/family-relation rules below.
  function fullyContains(shortTokens, longTokens) {
    if (shortTokens.length < 2) return false;
    const longSet = new Set(longTokens);
    return shortTokens.every(t => longSet.has(t));
  }

  // Compares one job-side phrase against a list of profile-side phrases and
  // returns the best relationship found: 'match' (same thing, worded differently,
  // or literally named as part of a compound profile phrase), 'partial'
  // (related but not the same — e.g. two different CRM-family terms), or
  // 'none' (no real relationship — avoids e.g. "Sales" ~ "Salesforce").
  function classifyPhrase(jobPhrase, profileTerms) {
    const jc = canonicalPhrase(jobPhrase);
    const jt = tokenize(jc);
    let best = 'none';
    for (const term of profileTerms) {
      const pc = canonicalPhrase(term);
      if (jc === pc) return 'match';
      const pt = tokenize(pc);
      if (fullyContains(jt, pt) || fullyContains(pt, jt)) return 'match';
      const overlap = jaccard(jt, pt);
      if (overlap >= 0.6) return 'match';
      if (overlap >= 0.25) best = 'partial';
      // Family relation: both mention "crm" but aren't the same phrase —
      // explicitly related, not identical (per the CRM Management vs
      // CRM Setup & Automation distinction).
      if (best === 'none' && jt.includes('crm') && pt.includes('crm')) best = 'partial';
    }
    return best;
  }

  function categorizePhrases(jobPhrases, profileTerms) {
    const matched = [], partial = [], missing = [];
    (jobPhrases || []).forEach(p => {
      if (!p || !p.trim()) return;
      const result = classifyPhrase(p, profileTerms);
      if (result === 'match') matched.push(p);
      else if (result === 'partial') partial.push(p);
      else missing.push(p);
    });
    return { matched, partial, missing };
  }

  // A specific-tool requirement (e.g. "HubSpot") that isn't in profile.tools
  // is reported as a partial match (related CRM experience) if the profile
  // has ANY CRM/automation tool, rather than a flat miss — but only when the
  // job phrase actually names a known tool, never invented.
  function toolAwarePartialNote(missingPhrase, profileTools) {
    const n = normalize(missingPhrase);
    const namesKnownTool = KNOWN_TOOLS.some(t => n.includes(t));
    if (!namesKnownTool || !profileTools || !profileTools.length) return null;
    const namesOwnedTool = profileTools.some(t => n.includes(normalize(t)));
    if (namesOwnedTool) return null; // already an exact match elsewhere
    return `Related CRM experience: ${profileTools.join(', ')}`;
  }

  function profileTermPool(profile) {
    return [...(profile.services || []), ...(profile.skills || []), ...(profile.tools || []), ...(profile.crmCapabilities || [])];
  }
  function profileExperienceTokens(profile) {
    const history = profile.workHistory || [];
    const respTexts = history.flatMap(w => w.responsibilities || []);
    // Include the roles/titles Karen actually held — these are the strongest
    // evidence a job title genuinely matches real experience, not just wording.
    const roleTexts = history.flatMap(w => [w.role || '', w.company || '']);
    const bag = [...(profile.services || []), ...(profile.skills || []), ...roleTexts, respTexts.join(' '), profile.professionalTitle || '', profile.summary || ''].join(' ');
    return tokenize(bag);
  }

  // Candidate capabilities inferred from the job title via the curated hint
  // table above. Only ever used as positive signal (see inferSkillSignals).
  function titleCapabilityHints(title) {
    const t = title || '';
    const hits = TITLE_CAPABILITY_HINTS.filter(h => h.pattern.test(t)).flatMap(h => h.capabilities);
    return [...new Set(hits)];
  }
  // Scans free text (title or description) for profile terms that are
  // substantially present in it, so an unstructured description can still
  // surface real signal without requiring the user to re-type it as "skills".
  function profileTermsFoundInText(text, profileTerms) {
    if (!text || !text.trim()) return [];
    const textTokens = new Set(tokenize(text));
    const found = [];
    profileTerms.forEach(term => {
      const termTokens = tokenize(canonicalPhrase(term));
      if (!termTokens.length) return;
      const present = termTokens.filter(t => textTokens.has(t)).length;
      if (present / termTokens.length >= 0.7) found.push(term);
    });
    return [...new Set(found)];
  }
  function dedupeByCanonical(list) {
    const seen = new Set(); const out = [];
    list.forEach(item => { const c = canonicalPhrase(item); if (!seen.has(c)) { seen.add(c); out.push(item); } });
    return out;
  }
  // Priority: explicit skills > explicit requirements > description > title.
  // Inferred candidates (from description/title) only ever contribute
  // positive signal (matched/partial) — they never create a "gap", since a
  // title or description implying a capability is not the same as the
  // employer stating it as a requirement.
  function inferSkillSignals(job, pool) {
    const titleHints = titleCapabilityHints(job.title);
    const titleTextHits = profileTermsFoundInText(job.title, pool);
    const descHits = profileTermsFoundInText(job.description, pool);
    return dedupeByCanonical([...titleHints, ...titleTextHits, ...descHits]);
  }

  // matchConfidence is separate from matchScore: it describes how much real
  // job data the score is based on, not how good the fit is. A title-only
  // job can still score well, but that score should be labeled Low confidence
  // so the user knows it's not based on a detailed listing.
  function computeMatchConfidence(job) {
    const hasSkills = !!(job.skills && job.skills.length);
    const hasRequirements = !!(job.requirements && job.requirements.length);
    const hasDescription = !!(job.description && job.description.trim().length > 20);
    if (hasSkills && hasRequirements) return 'High';
    if (hasSkills || hasRequirements || hasDescription) return 'Medium';
    return 'Low';
  }

  function jobHasUsableData(job, profile) {
    if ((job.skills && job.skills.length) || (job.requirements && job.requirements.length) || (job.description && job.description.trim())) return true;
    // Fall back to the title alone — usable if it maps to at least one known
    // capability pattern, or shares real vocabulary with the Job Profile.
    const pool = profile ? profileTermPool(profile) : [];
    return inferSkillSignals(job, pool).length > 0;
  }
  function profileHasUsableData(profile) {
    return !!((profile.services && profile.services.length) || (profile.skills && profile.skills.length)
      || (profile.tools && profile.tools.length) || (profile.crmCapabilities && profile.crmCapabilities.length)
      || (profile.workHistory && profile.workHistory.length));
  }

  // Only these fields ever feed the matching engine (see profileTermPool,
  // profileExperienceTokens, profileHasUsableData, toolAwarePartialNote
  // above) — fullName, languages, education, preferred*, portfolioUrl,
  // cvReference, and updatedAt are deliberately excluded, so changing any
  // of those never affects the signature.
  const PROFILE_MATCH_FIELDS = ['professionalTitle', 'summary', 'services', 'skills', 'tools', 'crmCapabilities', 'workHistory'];
  // Recursively sorts object keys before serializing so two objects with the
  // same content but different key insertion order produce an identical
  // string; array order is preserved (a reordered list is real content).
  function stableStringify(value) {
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
  }
  // A deterministic content signature of only the Job Profile fields the
  // matching engine actually uses. Same relevant content -> same signature;
  // any change to a relevant field -> a different signature; everything
  // else (metadata, timestamps, unrelated fields) never affects it.
  function profileMatchSignature(profile) {
    const relevant = {};
    PROFILE_MATCH_FIELDS.forEach((f) => {
      const v = profile && profile[f];
      relevant[f] = v !== undefined ? v : (f === 'professionalTitle' || f === 'summary' ? '' : []);
    });
    return stableStringify(relevant);
  }

  function matchCategory(score) {
    if (score === null || score === undefined) return null;
    if (score >= 90) return 'Strong Match';
    if (score >= 75) return 'Good Match';
    if (score >= 60) return 'Moderate Match';
    return 'Low Match';
  }

  // The recommendation text must never contradict the actual analysis — it is
  // a function of the score AND whether any real gaps were found, never just
  // the score bucket alone (a low score with zero identified gaps must not
  // say "review the missing requirements", since there aren't any).
  function recommendationFor(score, hasGaps) {
    if (score === null || score === undefined) return 'There is not enough job information to make a reliable match assessment.';
    if (hasGaps) {
      if (score >= 60) return 'Good potential match, but review the identified gaps before applying.';
      return 'Lower match — review the identified gaps before applying.';
    }
    if (score >= 90) return 'Excellent match. Your experience closely aligns with the available job information.';
    if (score >= 75) return 'Strong match. Your capabilities align well with this opportunity, with no clear gaps identified from the available job information.';
    if (score >= 60) return 'Several relevant capabilities align, but some requirements should be reviewed.';
    return 'Lower match based on the available information, though no specific gaps were identified.';
  }

  /* Weighted scoring: Skills 50%, Experience 30%, Tools 10%, Job-specific
   * requirements 10% — but a category is only included if there's real data
   * to evaluate it against; unavailable categories are excluded and the
   * remaining weights are renormalized, rather than treating missing data
   * as a zero (which would be inventing a negative signal). */
  function calculateJobMatch(job, profile) {
    const analyzedAt = new Date().toISOString();
    // Captured once per call so every return branch (including the "Not
    // enough data" ones) records what the profile looked like at analysis
    // time — isJobMatchStale() compares this against the CURRENT profile's
    // signature instead of comparing raw timestamps.
    const signature = profileMatchSignature(profile);
    if (!profileHasUsableData(profile)) {
      return {
        matchScore: null, matchStatus: 'Not enough data', matchConfidence: null,
        matchingSkills: [], partialSkills: [], missingSkills: [],
        matchedRequirements: [], partialRequirements: [], missingRequirements: [],
        matchExplanation: 'Your Job Profile does not have enough information yet (services, skills, tools, or work experience) to compare against this job.',
        analyzedAt, profileMatchSignature: signature,
      };
    }
    const pool = profileTermPool(profile);
    if (!jobHasUsableData(job, profile)) {
      return {
        matchScore: null, matchStatus: 'Not enough data', matchConfidence: 'Low',
        matchingSkills: [], partialSkills: [], missingSkills: [],
        matchedRequirements: [], partialRequirements: [], missingRequirements: [],
        matchExplanation: 'This job has no listed skills, requirements, or description, and its title does not indicate enough about the role to compare against your Job Profile.',
        analyzedAt, profileMatchSignature: signature,
      };
    }

    const explicitSkillsResult = categorizePhrases(job.skills, pool);
    const inferredCandidates = inferSkillSignals(job, pool);
    const inferredResult = categorizePhrases(inferredCandidates, pool);
    // Inferred candidates only ever add positive evidence — a title/description
    // implying a capability is never treated as the employer stating a gap.
    const skillsResult = {
      matched: dedupeByCanonical([...explicitSkillsResult.matched, ...inferredResult.matched]),
      partial: dedupeByCanonical([...explicitSkillsResult.partial, ...inferredResult.partial]),
      missing: explicitSkillsResult.missing,
    };
    const usedInference = inferredCandidates.length > 0 && !(job.skills && job.skills.length);
    const reqResult = categorizePhrases(job.requirements, pool);

    // Attach a "related tool" note to any missing requirement that names a
    // specific platform, when the profile has related (not identical) tool experience.
    const missingRequirementsWithNotes = reqResult.missing.map(m => {
      const note = toolAwarePartialNote(m, profile.tools);
      return note ? { text: m, note } : { text: m, note: null };
    });

    const categories = [];
    const hasSkillSignal = (job.skills && job.skills.length) || inferredCandidates.length > 0;
    if (hasSkillSignal) {
      const total = skillsResult.matched.length + skillsResult.partial.length + skillsResult.missing.length;
      const pct = total ? ((skillsResult.matched.length + skillsResult.partial.length * 0.5) / total) * 100 : null;
      if (pct !== null) categories.push({ key: 'skills', weight: 50, pct });
    }
    if (job.requirements && job.requirements.length) {
      const total = reqResult.matched.length + reqResult.partial.length + reqResult.missing.length;
      const pct = total ? ((reqResult.matched.length + reqResult.partial.length * 0.5) / total) * 100 : null;
      if (pct !== null) categories.push({ key: 'requirements', weight: 10, pct });
    }
    // Tools: only evaluated if the job actually names a known tool somewhere.
    const jobText = [job.title || '', ...(job.skills || []), ...(job.requirements || []), job.description || ''].join(' ');
    const jobNamedTools = KNOWN_TOOLS.filter(t => normalize(jobText).includes(t));
    if (jobNamedTools.length) {
      const owned = jobNamedTools.filter(t => (profile.tools || []).some(pt => normalize(pt).includes(t) || t.includes(normalize(pt))));
      const pct = (owned.length / jobNamedTools.length) * 100;
      categories.push({ key: 'tools', weight: 10, pct });
    }
    // Experience: does the profile's actual stated experience (services/skills/
    // work-history roles & responsibilities/summary) cover what this job is
    // about? Measured as coverage of the JOB's own tokens, not symmetric
    // Jaccard — a 2-word title compared against a full resume via Jaccard is
    // unfairly crushed by the resume's sheer size even for a perfect fit.
    const expTokenSet = new Set(profileExperienceTokens(profile));
    const jobTokens = tokenize(jobText);
    if (jobTokens.length && expTokenSet.size) {
      const pct = coverage(jobTokens, expTokenSet);
      if (pct !== null) categories.push({ key: 'experience', weight: 30, pct });
    }

    if (!categories.length) {
      return {
        matchScore: null, matchStatus: 'Not enough data', matchConfidence: computeMatchConfidence(job),
        matchingSkills: [], partialSkills: [], missingSkills: [],
        matchedRequirements: [], partialRequirements: [], missingRequirements: [],
        matchExplanation: 'Not enough overlapping information between this job and your Job Profile to calculate a reliable match.',
        analyzedAt, profileMatchSignature: signature,
      };
    }
    const totalWeight = categories.reduce((s, c) => s + c.weight, 0);
    const score = Math.round(categories.reduce((s, c) => s + (c.pct * c.weight), 0) / totalWeight);

    const explanationParts = [];
    if (job.skills && job.skills.length) {
      explanationParts.push(`${explicitSkillsResult.matched.length} of ${job.skills.length} listed skill${job.skills.length === 1 ? '' : 's'} matched directly` +
        (explicitSkillsResult.partial.length ? `, ${explicitSkillsResult.partial.length} related` : '') +
        (explicitSkillsResult.missing.length ? `, ${explicitSkillsResult.missing.length} not found in your profile` : '') + '.');
    }
    if (usedInference) {
      explanationParts.push(`This job has no listed skills, so its title${job.description && job.description.trim() ? ' and description' : ''} ("${job.title}") was used to identify commonly relevant capabilities — ${inferredResult.matched.length} matched your profile directly and ${inferredResult.partial.length} were related.`);
    }
    if (job.requirements && job.requirements.length) {
      explanationParts.push(`${reqResult.matched.length} of ${job.requirements.length} requirement${job.requirements.length === 1 ? '' : 's'} matched directly` +
        (reqResult.partial.length ? `, ${reqResult.partial.length} related` : '') +
        (reqResult.missing.length ? `, ${reqResult.missing.length} not found` : '') + '.');
    }
    if (jobNamedTools.length) {
      explanationParts.push(`This job references ${jobNamedTools.length} named tool${jobNamedTools.length === 1 ? '' : 's'}; your profile lists: ${(profile.tools || []).join(', ') || 'none'}.`);
    }

    const hasGaps = skillsResult.missing.length > 0 || missingRequirementsWithNotes.length > 0;
    const confidence = computeMatchConfidence(job);
    if (confidence === 'Low') {
      explanationParts.push('Limited job information — this match is based primarily on the job title and available profile data.');
    }

    return {
      matchScore: score,
      matchStatus: 'Analyzed',
      matchConfidence: confidence,
      matchingSkills: skillsResult.matched,
      partialSkills: skillsResult.partial,
      missingSkills: skillsResult.missing,
      matchedRequirements: reqResult.matched,
      partialRequirements: reqResult.partial.map(text => ({ text, note: toolAwarePartialNote(text, profile.tools) })),
      missingRequirements: missingRequirementsWithNotes,
      matchExplanation: explanationParts.join(' '),
      analyzedAt, profileMatchSignature: signature,
    };
  }

  return { calculateJobMatch, matchCategory, recommendationFor, classifyPhrase, canonicalPhrase, tokenize, KNOWN_TOOLS, titleCapabilityHints, jobHasUsableData, computeMatchConfidence, profileMatchSignature };
});
