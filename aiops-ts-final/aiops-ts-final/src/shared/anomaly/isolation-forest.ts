interface Node {
  size: number;
  depth: number;
  feature?: number;
  split?: number;
  left?: Node;
  right?: Node;
}

function averagePathLength(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  const euler = 0.5772156649;
  return 2 * (Math.log(n - 1) + euler) - (2 * (n - 1)) / n;
}

function buildTree(samples: number[][], depth: number, maxDepth: number): Node {
  const node: Node = { size: samples.length, depth };
  if (samples.length <= 1 || depth >= maxDepth || samples[0]?.length === 0) return node;

  const dim = samples[0].length;
  const candidateFeatures = Array.from({ length: dim }, (_, i) => i).filter((feature) => {
    const values = samples.map((s) => s[feature]);
    return Math.min(...values) < Math.max(...values);
  });
  if (!candidateFeatures.length) return node;

  const feature = candidateFeatures[Math.floor(Math.random() * candidateFeatures.length)];
  const values = samples.map((s) => s[feature]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const split = min + Math.random() * (max - min);
  const left = samples.filter((s) => s[feature] < split);
  const right = samples.filter((s) => s[feature] >= split);
  if (!left.length || !right.length) return node;

  node.feature = feature;
  node.split = split;
  node.left = buildTree(left, depth + 1, maxDepth);
  node.right = buildTree(right, depth + 1, maxDepth);
  return node;
}

function pathLength(node: Node, sample: number[]): number {
  if (node.feature === undefined || node.split === undefined || !node.left || !node.right) {
    return node.depth + averagePathLength(node.size);
  }
  return sample[node.feature] < node.split ? pathLength(node.left, sample) : pathLength(node.right, sample);
}

export class IsolationForestLite {
  private trees: Node[] = [];
  private sampleSize = 0;

  fit(samples: number[][], treeCount = 25, sampleSize = 32): void {
    if (samples.length < 8) {
      this.trees = [];
      this.sampleSize = samples.length;
      return;
    }
    this.sampleSize = Math.min(sampleSize, samples.length);
    const maxDepth = Math.ceil(Math.log2(this.sampleSize));
    this.trees = Array.from({ length: treeCount }, () => {
      const shuffled = [...samples].sort(() => Math.random() - 0.5).slice(0, this.sampleSize);
      return buildTree(shuffled, 0, maxDepth);
    });
  }

  score(sample: number[]): number {
    if (!this.trees.length || this.sampleSize < 2) return 0;
    const avgPath = this.trees.reduce((sum, tree) => sum + pathLength(tree, sample), 0) / this.trees.length;
    const c = averagePathLength(this.sampleSize);
    return c === 0 ? 0 : 2 ** (-avgPath / c);
  }
}
