import { PipelineRun } from '../db/models/pipelineRunModel';
import { getConfig } from '../config';

export async function pruneRunsForProject(projectId: string): Promise<number> {
  const cfg = getConfig();
  const retention = cfg.pipeline.runsRetention;
  const toDelete = await PipelineRun.find({ projectId })
    .sort({ queueSequence: -1 })
    .skip(retention)
    .select('_id')
    .lean();
  if (toDelete.length === 0) return 0;
  const ids = toDelete.map((r) => r._id);
  const result = await PipelineRun.deleteMany({ _id: { $in: ids } });
  return result.deletedCount ?? 0;
}
