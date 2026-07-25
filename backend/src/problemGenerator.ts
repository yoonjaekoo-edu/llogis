
export interface ProblemTemplate {
  title: string;
  template: string;
  answerFormula: (vars: { [key: string]: number }) => string;
  vars: { [key: string]: { min: number; max: number } };
  tags: string[];
  difficulty: number;
}

export const templates: ProblemTemplate[] = [
  {
    title: '일차방정식 연습',
    template: '$ax + b = c$ 의 해는?',
    answerFormula: (v) => ((v.c - v.b) / v.a).toString(),
    vars: {
      a: { min: 2, max: 10 },
      b: { min: -15, max: 20 },
      c: { min: 21, max: 50 }
    },
    tags: ['일차방정식', '계산'],
    difficulty: 65000
  },
  {
    title: '연립방정식 연습',
    template: '$$\\begin{cases} x + y = a \\\\ x - y = b \\end{cases}$$ 일 때, $x$의 값은?',
    answerFormula: (v) => ((v.a + v.b) / 2).toString(),
    vars: {
      a: { min: 10, max: 50 },
      b: { min: 2, max: 10 }
    },
    tags: ['연립방정식', '계산'],
    difficulty: 85000
  },
  {
    title: '지수법칙 곱셈',
    template: '$a^b \\times a^x = a^c$ 일 때, $x$는?',
    answerFormula: (v) => (v.c - v.b).toString(),
    vars: {
      a: { min: 2, max: 5 },
      b: { min: 2, max: 5 },
      c: { min: 6, max: 12 }
    },
    tags: ['지수법칙', '계산'],
    difficulty: 80000
  },
  {
    title: '삼각형의 내각',
    template: '삼각형의 세 내각 중 두 각이 $a^\\circ, b^\\circ$ 일 때, 나머지 한 각은 몇 도인가?',
    answerFormula: (v) => (180 - v.a - v.b).toString(),
    vars: {
      a: { min: 30, max: 80 },
      b: { min: 30, max: 80 }
    },
    tags: ['도형', '계산'],
    difficulty: 70000
  },
  {
      title: '일차함수 함숫값',
      template: '$y = ax + b$ 에서 $x = c$ 일 때, $y$의 값은?',
      answerFormula: (v) => (v.a * v.c + v.b).toString(),
      vars: {
          a: { min: -5, max: 5 },
          b: { min: -10, max: 10 },
          c: { min: -5, max: 5 }
      },
      tags: ['일차함수', '계산'],
      difficulty: 82000
  },
  {
      title: '식의 값 계산',
      template: '$x = a, y = b$ 일 때, $3x - 2y + 5$의 값은?',
      answerFormula: (v) => (3 * v.a - 2 * v.b + 5).toString(),
      vars: {
          a: { min: -10, max: 10 },
          b: { min: -10, max: 10 }
      },
      tags: ['식의계산', '계산'],
      difficulty: 75000
  },
  {
      title: '이차방정식 - 제곱근',
      template: '$x^2 = a$ 의 양의 근을 구하시오.',
      answerFormula: (v) => (v.r).toString(),
      vars: { r: { min: 2, max: 15 } },
      tags: ['이차방정식', '계산'],
      difficulty: 78000
  },
  {
      title: '이차방정식 - 인수분해',
      template: '$(x - a)(x - b) = 0$ 의 두 근 중 더 큰 근을 구하시오.',
      answerFormula: (v) => (v.a).toString(),
      vars: { a: { min: 2, max: 12 }, b: { min: 1, max: 11 } },
      tags: ['이차방정식', '인수분해'],
      difficulty: 88000
  },
  {
      title: '이차방정식 - 완전제곱',
      template: '$(x - a)^2 = b$ 일 때, $x$의 값을 구하시오. (단, $x > a$)',
      answerFormula: (v) => (v.a + v.c).toString(),
      vars: { a: { min: 1, max: 10 }, c: { min: 2, max: 8 } },
      tags: ['이차방정식', '계산'],
      difficulty: 90000
  },
  {
      title: '이차방정식 - 근의 합',
      template: '이차방정식 $x^2 + bx + c = 0$ 의 두 근의 합을 구하시오.',
      answerFormula: (v) => (v.r1 + v.r2).toString(),
      vars: { r1: { min: 2, max: 12 }, r2: { min: 2, max: 12 } },
      tags: ['이차방정식', '계산'],
      difficulty: 92000
  }
];

export function generateProblem(filterTags?: string[]) {
  // Filter templates based on provided tags
  let filteredTemplates = templates;
  if (filterTags && filterTags.length > 0) {
    filteredTemplates = templates.filter(template => 
      template.tags.some(tag => filterTags.includes(tag))
    );
  }
  
  // If no templates match the filter, fall back to all templates
  if (filteredTemplates.length === 0) {
    filteredTemplates = templates;
  }
  
  const template = filteredTemplates[Math.floor(Math.random() * filteredTemplates.length)];
  const variables: { [key: string]: number } = {};
   
  // For linear equation, ensure (c-b) is divisible by a for integer answers
  if (template.title === '일차방정식 연습') {
      const a = Math.floor(Math.random() * (template.vars.a.max - template.vars.a.min + 1)) + template.vars.a.min;
      let x, b, c;
      do {
          x = Math.floor(Math.random() * 10) + 1;
          b = Math.floor(Math.random() * (template.vars.b.max - template.vars.b.min + 1)) + template.vars.b.min;
          c = a * x + b;
      } while (c < template.vars.c.min);
      const bSign = b >= 0 ? '+' : '-';
      const bAbs = Math.abs(b);
      const content = `$${a}x ${bSign} ${bAbs} = ${c}$ 의 해는?`;
      return {
          title: template.title, content, answer: String(x),
          difficulty: template.difficulty, tags: template.tags
      };
  } else if (template.title === '연립방정식 연습') {
      // Ensure a+b is even for integer answer
      const x = Math.floor(Math.random() * 20) + 5;
      const y = Math.floor(Math.random() * (x - 1)) + 1;
      variables['a'] = x + y;
      variables['b'] = x - y;
  } else if (template.title === '이차방정식 - 제곱근') {
      const r = Math.floor(Math.random() * 14) + 2;
      const a = r * r;
      const content = `$x^2 = ${a}$ 의 양의 근을 구하시오.`;
      return {
          title: template.title, content, answer: String(r),
          difficulty: template.difficulty, tags: template.tags
      };
  } else if (template.title === '이차방정식 - 인수분해') {
      let a = Math.floor(Math.random() * 11) + 2;
      let b = Math.floor(Math.random() * 11) + 1;
      if (b >= a) b = a - 1;
      if (b < 1) { a = 2; b = 1; }
      const content = `$(x - ${a})(x - ${b}) = 0$ 의 두 근 중 더 큰 근을 구하시오.`;
      return {
          title: template.title,
          content,
          answer: String(a),
          difficulty: template.difficulty,
          tags: template.tags
      };
  } else if (template.title === '이차방정식 - 완전제곱') {
      const a = Math.floor(Math.random() * 10) + 1;
      const c = Math.floor(Math.random() * 7) + 2;
      const b = c * c;
      const answer = a + c;
      const content = `$(x - ${a})^2 = ${b}$ 일 때, $x$의 값을 구하시오. (단, $x > ${a}$)`;
      return {
          title: template.title,
          content,
          answer: String(answer),
          difficulty: template.difficulty,
          tags: template.tags
      };
  } else if (template.title === '이차방정식 - 근의 합') {
      let r1 = Math.floor(Math.random() * 11) + 2;
      let r2 = Math.floor(Math.random() * 11) + 2;
      if (r2 === r1) r2 = r1 + 1;
      if (r2 > 12) r2 = r1 - 1;
      const b = -(r1 + r2);
      const c = r1 * r2;
      const bStr = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
      const content = `이차방정식 $x^2 ${bStr}x + ${c} = 0$ 의 두 근의 합을 구하시오.`;
      return {
          title: template.title,
          content,
          answer: String(r1 + r2),
          difficulty: template.difficulty,
          tags: template.tags
      };
  } else {
      for (const [name, range] of Object.entries(template.vars)) {
        let val = 0;
        // 0이 되지 않도록 반복 생성 (범위가 0을 포함하는 경우 대비)
        do {
            val = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
        } while (val === 0);
        variables[name] = val;
      }
  }

  let content = template.template;
  for (const [name, val] of Object.entries(variables)) {
    // Replace variable names. We use a regex that looks for the variable name with a word boundary before it,
    // and ensuring it's not part of another word (except for 'x' which is the math unknown).
    const regex = new RegExp(`\\b${name}(?![a-wy-z가-힣])`, 'g');
    content = content.replace(regex, val.toString());
  }

  return {
    title: template.title,
    content,
    answer: template.answerFormula(variables),
    difficulty: template.difficulty,
    tags: template.tags
  };
}
