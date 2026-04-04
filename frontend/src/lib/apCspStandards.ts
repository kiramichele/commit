// ============================================================
// frontend/src/lib/apCspStandards.ts
// Full AP CSP Big Ideas and Learning Objectives
// Source: College Board AP CSP Course and Exam Description
// ============================================================

export interface LearningObjective {
  code: string       // e.g. "AAP-1.A"
  description: string
}

export interface BigIdea {
  code: string       // e.g. "AAP"
  name: string       // e.g. "Algorithms and Programming"
  color: string      // display color
  bg: string         // badge background
  objectives: LearningObjective[]
}

export const BIG_IDEAS: BigIdea[] = [
  {
    code: "CRD",
    name: "Creative Development",
    color: "#7C3AED",
    bg: "#F3E8FF",
    objectives: [
      { code: "CRD-1.A", description: "Explain how computing innovations are developed by groups of people" },
      { code: "CRD-1.B", description: "Explain how computing innovations are improved through collaboration" },
      { code: "CRD-1.C", description: "Demonstrate effective interpersonal skills during collaboration" },
      { code: "CRD-2.A", description: "Describe the purpose of a computing innovation" },
      { code: "CRD-2.B", description: "Explain how a program or code segment functions" },
      { code: "CRD-2.C", description: "Identify input(s) to a program" },
      { code: "CRD-2.D", description: "Evaluate a program for correctness" },
      { code: "CRD-2.E", description: "Develop a program using a development process" },
      { code: "CRD-2.F", description: "Design a program and its user interface" },
      { code: "CRD-2.G", description: "Describe the purpose of a code segment or program by writing documentation" },
      { code: "CRD-2.H", description: "Identify the challenges of collaboration" },
      { code: "CRD-2.I", description: "Acknowledge the importance of documentation" },
      { code: "CRD-2.J", description: "Identify inputs and corresponding outputs" },
    ],
  },
  {
    code: "DAT",
    name: "Data & Analysis",
    color: "#0C447C",
    bg: "#EBF1FD",
    objectives: [
      { code: "DAT-1.A", description: "Explain how data can be represented using bits" },
      { code: "DAT-1.B", description: "Explain the consequences of using bits to represent data" },
      { code: "DAT-1.C", description: "Calculate the number of bits required to represent a set of data" },
      { code: "DAT-1.D", description: "Compare data compression algorithms" },
      { code: "DAT-1.E", description: "Compare lossless and lossy compression algorithms" },
      { code: "DAT-2.A", description: "Describe what information can be extracted from data" },
      { code: "DAT-2.B", description: "Describe what information can be extracted from metadata" },
      { code: "DAT-2.C", description: "Identify the challenges associated with processing data" },
      { code: "DAT-2.D", description: "Extract information from data using a program" },
      { code: "DAT-2.E", description: "Explain how programs can be used to gain insight and knowledge from data" },
    ],
  },
  {
    code: "AAP",
    name: "Algorithms & Programming",
    color: "#166534",
    bg: "#DCFCE7",
    objectives: [
      { code: "AAP-1.A", description: "Represent a value with a variable" },
      { code: "AAP-1.B", description: "Determine the value of a variable as a result of an assignment" },
      { code: "AAP-1.C", description: "Represent a list or string using a variable" },
      { code: "AAP-1.D", description: "For list operations: determine the result" },
      { code: "AAP-2.A", description: "Express an algorithm that uses sequencing" },
      { code: "AAP-2.B", description: "Represent a step-by-step algorithmic process using sequential code" },
      { code: "AAP-2.C", description: "Evaluate expressions that use arithmetic operators" },
      { code: "AAP-2.D", description: "Evaluate expressions that use string concatenation or string procedures" },
      { code: "AAP-2.E", description: "For relationships between variables: Express using a Boolean expression" },
      { code: "AAP-2.F", description: "Express an algorithm that uses selection (if/else)" },
      { code: "AAP-2.G", description: "Express an algorithm that uses iteration (loops)" },
      { code: "AAP-2.H", description: "For nested selection or nested iteration: determine result" },
      { code: "AAP-2.I", description: "Determine the result of code that includes lists" },
      { code: "AAP-2.J", description: "Express an algorithm that uses recursion" },
      { code: "AAP-2.K", description: "For algorithms: determine their correctness" },
      { code: "AAP-2.L", description: "Compare multiple algorithms to determine if they yield the same result" },
      { code: "AAP-2.M", description: "Evaluate algorithms analytically and empirically" },
      { code: "AAP-2.N", description: "Explain the purpose of libraries and APIs" },
      { code: "AAP-3.A", description: "Write a program that includes a procedure" },
      { code: "AAP-3.B", description: "Explain the purpose of a procedure" },
      { code: "AAP-3.C", description: "Develop a program that uses student-developed abstractions" },
      { code: "AAP-3.D", description: "Select appropriate libraries or existing code" },
      { code: "AAP-3.E", description: "For a given problem, identify an appropriate algorithm" },
      { code: "AAP-3.F", description: "Describe the relationships between a problem and its subproblems" },
      { code: "AAP-4.A", description: "For a given problem, explain the difference between solvable and unsolvable" },
      { code: "AAP-4.B", description: "Explain the difference between a decidable and undecidable problem" },
      { code: "AAP-4.C", description: "Use the concept of efficiency to evaluate algorithms" },
      { code: "AAP-4.D", description: "Evaluate algorithms analytically and empirically for efficiency" },
    ],
  },
  {
    code: "CSN",
    name: "Computer Systems & Networks",
    color: "#854D0E",
    bg: "#FEF9C3",
    objectives: [
      { code: "CSN-1.A", description: "Explain how computing devices work together in a network" },
      { code: "CSN-1.B", description: "Explain how the Internet works" },
      { code: "CSN-1.C", description: "Explain the characteristics of the Internet and the systems built on it" },
      { code: "CSN-1.D", description: "Describe the differences between the Internet and the World Wide Web" },
      { code: "CSN-1.E", description: "For fault tolerance: explain how the Internet is designed" },
      { code: "CSN-1.F", description: "Explain how data is sent through the Internet via packets" },
      { code: "CSN-2.A", description: "Describe the challenges associated with Internet scalability" },
      { code: "CSN-2.B", description: "Describe what a sequential or parallel computing solution is" },
      { code: "CSN-2.C", description: "Describe conditions that influence the efficiency of parallel solutions" },
      { code: "CSN-2.D", description: "Compare problem solutions using sequential and parallel processing" },
    ],
  },
  {
    code: "IOC",
    name: "Impact of Computing",
    color: "#991B1B",
    bg: "#FEE2E2",
    objectives: [
      { code: "IOC-1.A", description: "Explain how an effect of a computing innovation can be both beneficial and harmful" },
      { code: "IOC-1.B", description: "Explain how a computing innovation can have unintended effects" },
      { code: "IOC-1.C", description: "Describe issues that contribute to the digital divide" },
      { code: "IOC-1.D", description: "Explain how bias exists in computing innovations" },
      { code: "IOC-1.E", description: "Explain how people participate in problem-solving processes at scale" },
      { code: "IOC-1.F", description: "Explain how the use of computing can raise legal and ethical concerns" },
      { code: "IOC-2.A", description: "Describe the risks to privacy from collecting and storing personal data" },
      { code: "IOC-2.B", description: "Explain how computing has impacted collaboration and communication" },
      { code: "IOC-2.C", description: "Describe how cybersecurity concerns influence the development of computing innovations" },
    ],
  },
]

// ── HELPERS ───────────────────────────────────────────────────

export const ALL_OBJECTIVES: LearningObjective[] = BIG_IDEAS.flatMap(b => b.objectives)

export function getBigIdea(code: string): BigIdea | undefined {
  const bigIdeaCode = code.split('-')[0]
  return BIG_IDEAS.find(b => b.code === bigIdeaCode)
}

export function getObjective(code: string): LearningObjective | undefined {
  return ALL_OBJECTIVES.find(o => o.code === code)
}

// Returns display-ready badge info for a standard code
export function getStandardMeta(code: string) {
  const bigIdea = getBigIdea(code)
  return {
    code,
    bigIdeaCode: bigIdea?.code || code.split('-')[0],
    bigIdeaName: bigIdea?.name || '',
    color: bigIdea?.color || '#888780',
    bg: bigIdea?.bg || '#F1EFE8',
    description: getObjective(code)?.description || '',
  }
}