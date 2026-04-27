const express = require('express');
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth.middleware');
const { success } = require('../utils/response');

const router = express.Router();
router.use(authenticate);

// GET /api/dashboard/stats
router.get('/stats', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const [totalPosts, byStatus, byPlatform] = await Promise.all([
      prisma.post.count({ where: { userId } }),

      prisma.post.groupBy({
        by: ['status'],
        where: { userId },
        _count: { status: true },
      }),

      prisma.platformPost.groupBy({
        by: ['platform', 'status'],
        where: { post: { userId } },
        _count: { platform: true },
      }),
    ]);

    const published = byStatus.find((s) => s.status === 'PUBLISHED')?._count?.status || 0;
    const successRate = totalPosts > 0 ? ((published / totalPosts) * 100).toFixed(1) : 0;

    // Reshape platform stats
    const platformStats = {};
    for (const row of byPlatform) {
      const p = row.platform.toLowerCase();
      if (!platformStats[p]) platformStats[p] = { total: 0, published: 0, failed: 0 };
      platformStats[p].total += row._count.platform;
      if (row.status === 'PUBLISHED') platformStats[p].published += row._count.platform;
      if (row.status === 'FAILED') platformStats[p].failed += row._count.platform;
    }

    return success(res, {
      total_posts: totalPosts,
      success_rate: `${successRate}%`,
      by_status: byStatus.map((s) => ({ status: s.status, count: s._count.status })),
      by_platform: platformStats,
    });
  } catch (err) { next(err); }
});

module.exports = router;