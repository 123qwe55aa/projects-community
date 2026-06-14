export type BuildingStyle = 'workshop' | 'data-center' | 'studio' | 'community-hall';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  background: string;
  buildingStyle: BuildingStyle;
  starterDecision?: string;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'tech-stack-decision',
    name: 'Tech Stack Decision',
    description: 'Pick the right technologies for a new project or major component.',
    background:
      'We need to decide on the core technology stack for this project. This includes evaluating languages, frameworks, libraries, and infrastructure choices that will shape development for the foreseeable future. The goal is to choose a stack that balances developer familiarity, long-term maintainability, ecosystem health, and performance requirements.',
    buildingStyle: 'workshop',
    starterDecision: 'Which primary programming language and runtime should we use?',
  },
  {
    id: 'tool-evaluation',
    name: 'Tool Evaluation',
    description: 'Systematically compare tools, services, or platforms against your requirements.',
    background:
      'We are evaluating a set of tools or services to address a specific operational or development need. This project will track the options under consideration, collect structured data on each, and record the final adoption decision along with the reasoning.',
    buildingStyle: 'data-center',
    starterDecision: 'Which tool or service best meets our requirements?',
  },
  {
    id: 'framework-comparison',
    name: 'Framework Comparison',
    description: 'Compare frameworks side-by-side across performance, DX, and community support.',
    background:
      'We are comparing multiple frameworks to determine which best fits our needs. Criteria include developer experience, performance benchmarks, ecosystem maturity, community size, licensing, and long-term support guarantees. Insights will be gathered collaboratively and consolidated into a final recommendation.',
    buildingStyle: 'community-hall',
    starterDecision: 'Which framework should we standardize on for this use case?',
  },
  {
    id: 'architecture-design',
    name: 'Architecture Design',
    description: 'Design and document the system architecture, key patterns, and tradeoffs.',
    background:
      'This project covers the architecture design process for a system or major feature. We will explore architectural patterns, define boundaries between components, evaluate tradeoffs (e.g., scalability vs. simplicity), and document the decisions that shape the overall structure.',
    buildingStyle: 'studio',
    starterDecision: 'What top-level architectural pattern should we adopt?',
  },
  {
    id: 'vendor-assessment',
    name: 'Vendor Assessment',
    description: 'Evaluate and compare external vendors, SaaS providers, or managed services.',
    background:
      'We need to select an external vendor or managed service to fulfil a business or technical requirement. This project tracks vendor candidates, scores them against defined criteria (pricing, SLA, support, compliance, integration effort), and records the final procurement decision.',
    buildingStyle: 'data-center',
    starterDecision: 'Which vendor best satisfies our criteria at an acceptable cost?',
  },
  {
    id: 'learning-path',
    name: 'Learning Path',
    description: 'Structure a learning journey — resources, milestones, and skill decisions.',
    background:
      'This project organises a structured learning path for a topic or skill area. We will capture useful resources, track milestone decisions (e.g., which course or book to follow), and document key insights gathered along the way.',
    buildingStyle: 'workshop',
    starterDecision: 'What is the best starting resource or course for this topic?',
  },
];
