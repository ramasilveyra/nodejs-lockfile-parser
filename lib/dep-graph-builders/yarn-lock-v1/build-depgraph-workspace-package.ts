import { DepGraphBuilder } from '@snyk/dep-graph';
import {
  addPkgNodeToGraph,
  getChildNodeWorkspace,
  getTopLevelDeps,
  PkgNode,
} from '../util';
import type { PackageJsonBase } from '../types';
import type { DepGraphBuildOptions, YarnLockPackages } from './types';

export const buildDepGraphYarnLockV1Workspace = (
  extractedYarnLockV1Pkgs: YarnLockPackages,
  pkgJson: PackageJsonBase,
  workspacePkgNameToVersion: Record<string, string>,
  options: DepGraphBuildOptions,
) => {
  const { includeDevDeps, strictOutOfSync } = options;

  const depGraphBuilder = new DepGraphBuilder(
    { name: 'yarn' },
    { name: pkgJson.name, version: pkgJson.version },
  );

  const visitedMap: Set<string> = new Set();

  const topLevelDeps = getTopLevelDeps(pkgJson, { includeDevDeps });

  const rootNode: PkgNode = {
    id: 'root-node',
    name: pkgJson.name,
    version: pkgJson.version,
    dependencies: topLevelDeps,
    isDev: false,
  };

  dfsVisit(
    depGraphBuilder,
    rootNode,
    visitedMap,
    extractedYarnLockV1Pkgs,
    workspacePkgNameToVersion,
    strictOutOfSync,
  );

  return depGraphBuilder.build();
};

/**
 * Use DFS to add all nodes and edges to the depGraphBuilder and prune cyclic nodes.
 * The colorMap keep track of the state of node during traversal.
 *  - If a node doesn't exist in the map, it means it hasn't been visited.
 *  - If a node is GRAY, it means it has already been discovered but its subtree hasn't been fully traversed.
 *  - If a node is BLACK, it means its subtree has already been fully traversed.
 *  - When first exploring an edge, if it points to a GRAY node, a cycle is found and the GRAY node is pruned.
 *     - A pruned node has id `${originalId}|1`
 * When coming across another workspace package as child node, simply add the node and edge to the graph and mark it as BLACK.
 */
const dfsVisit = (
  depGraphBuilder: DepGraphBuilder,
  node: PkgNode,
  visitedMap: Set<string>,
  extractedYarnLockV1Pkgs: YarnLockPackages,
  workspacePkgNameToVersion: Record<string, string>,
  strictOutOfSync: boolean,
): void => {
  visitedMap.add(node.id);

  for (const [name, depInfo] of Object.entries(node.dependencies || {})) {
    const isWorkspacePkg = !!workspacePkgNameToVersion[name];

    const childNode = getChildNodeWorkspace(
      name,
      depInfo,
      workspacePkgNameToVersion,
      extractedYarnLockV1Pkgs,
      strictOutOfSync,
    );

    if (!visitedMap.has(childNode.id)) {
      addPkgNodeToGraph(depGraphBuilder, childNode, {
        isCyclic: false,
        isWorkspacePkg,
      });
      if (!isWorkspacePkg) {
        dfsVisit(
          depGraphBuilder,
          childNode,
          visitedMap,
          extractedYarnLockV1Pkgs,
          workspacePkgNameToVersion,
          strictOutOfSync,
        );
      }
    }

    depGraphBuilder.connectDep(node.id, childNode.id);
  }
};
