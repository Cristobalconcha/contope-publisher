<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Resolves which header/body/footer region document applies to a given
 * WordPress post, from the region documents registered in the canvas
 * repository (kind + scope + targets/excludes).
 *
 * Match-rule specificity, most specific wins (mirrors Divi's Use-On
 * precedence: an explicit page beats a category beats "all pages"):
 *   1. `post` — this exact post ID.
 *   2. `children_of` — this post is a descendant of the given page.
 *   3. `category` / `tag` — this post is in that taxonomy term.
 *   4. `homepage` — this post is the configured front page.
 *   5. `all_pages` / `all_posts` — matches every post of that content type.
 *   6. A global region of that kind (no match rules at all).
 *   7. null — no region of that kind applies.
 *
 * A candidate whose excludes list matches this post is skipped entirely,
 * regardless of how specific its targets match — exclusion always wins over
 * inclusion for that candidate, mirroring Divi's "Exclude From" tab.
 *
 * When more than one candidate ties at the same specificity level, the one
 * with the lowest documentId (stable, deterministic) wins rather than an
 * arbitrary array order, so the resolution is reproducible.
 */
final class OCD_Template_Region_Resolver
{
    /** Highest number wins when multiple targets on the same document match. */
    private const SPECIFICITY = [
        OCD_Canvas_Document_Repository::MATCH_TYPE_POST => 5,
        OCD_Canvas_Document_Repository::MATCH_TYPE_CHILDREN_OF => 4,
        OCD_Canvas_Document_Repository::MATCH_TYPE_CATEGORY => 3,
        OCD_Canvas_Document_Repository::MATCH_TYPE_TAG => 3,
        OCD_Canvas_Document_Repository::MATCH_TYPE_HOMEPAGE => 2,
        OCD_Canvas_Document_Repository::MATCH_TYPE_ALL_PAGES => 1,
        OCD_Canvas_Document_Repository::MATCH_TYPE_ALL_POSTS => 1,
    ];

    public function __construct(private OCD_Canvas_Document_Repository $repository)
    {
    }

    /**
     * @return array<string, mixed>|null Resolved region document, or null if
     *                                    no region of that kind applies.
     */
    public function resolve(string $kind, int $post_id)
    {
        if (!in_array($kind, OCD_Canvas_Document_Repository::REGION_KINDS, true)) {
            return null;
        }

        $context = $this->build_context($post_id);

        $candidates = array_values(array_filter(
            $this->repository->list_region_documents(),
            static fn (array $doc): bool => $doc['regionKind'] === $kind
        ));
        if ($candidates === []) {
            return null;
        }

        $best_doc = null;
        $best_specificity = -1;
        foreach ($candidates as $doc) {
            if ($doc['regionScope'] === OCD_Canvas_Document_Repository::REGION_SCOPE_GLOBAL) {
                if ($this->any_rule_matches($doc['regionExcludes'] ?? [], $context)) {
                    continue;
                }
                if ($best_specificity < 0) {
                    $best_doc = $doc;
                    $best_specificity = 0;
                }
                continue;
            }
            if ($doc['regionScope'] !== OCD_Canvas_Document_Repository::REGION_SCOPE_LOCAL) {
                continue;
            }
            if ($this->any_rule_matches($doc['regionExcludes'] ?? [], $context)) {
                continue;
            }
            $specificity = $this->best_matching_specificity($doc['regionTargets'], $context);
            if ($specificity !== null && $specificity > $best_specificity) {
                $best_doc = $doc;
                $best_specificity = $specificity;
            } elseif ($specificity !== null && $specificity === $best_specificity && $best_doc !== null) {
                if (strcmp($doc['documentId'], $best_doc['documentId']) < 0) {
                    $best_doc = $doc;
                }
            }
        }

        return $best_doc;
    }

    /**
     * @param array<int, array{type: string, id?: int}> $rules
     * @param array<string, mixed> $context
     */
    private function any_rule_matches(array $rules, array $context): bool
    {
        foreach ($rules as $rule) {
            if ($this->rule_matches($rule, $context)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @param array<int, array{type: string, id?: int}> $rules
     * @param array<string, mixed> $context
     */
    private function best_matching_specificity(array $rules, array $context): ?int
    {
        $best = null;
        foreach ($rules as $rule) {
            if (!$this->rule_matches($rule, $context)) {
                continue;
            }
            $specificity = self::SPECIFICITY[$rule['type']] ?? 0;
            if ($best === null || $specificity > $best) {
                $best = $specificity;
            }
        }
        return $best;
    }

    /**
     * @param array{type: string, id?: int} $rule
     * @param array<string, mixed> $context
     */
    private function rule_matches(array $rule, array $context): bool
    {
        switch ($rule['type'] ?? '') {
            case OCD_Canvas_Document_Repository::MATCH_TYPE_ALL_PAGES:
                return $context['postType'] === 'page';
            case OCD_Canvas_Document_Repository::MATCH_TYPE_ALL_POSTS:
                return $context['postType'] === 'post';
            case OCD_Canvas_Document_Repository::MATCH_TYPE_HOMEPAGE:
                return $context['isHomepage'];
            case OCD_Canvas_Document_Repository::MATCH_TYPE_POST:
                return isset($rule['id']) && $rule['id'] === $context['postId'];
            case OCD_Canvas_Document_Repository::MATCH_TYPE_CHILDREN_OF:
                return isset($rule['id']) && in_array($rule['id'], $context['ancestorIds'], true);
            case OCD_Canvas_Document_Repository::MATCH_TYPE_CATEGORY:
                return isset($rule['id']) && in_array($rule['id'], $context['categoryIds'], true);
            case OCD_Canvas_Document_Repository::MATCH_TYPE_TAG:
                return isset($rule['id']) && in_array($rule['id'], $context['tagIds'], true);
            default:
                return false;
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function build_context(int $post_id): array
    {
        $post = get_post($post_id);
        $post_type = $post instanceof WP_Post ? $post->post_type : '';

        return [
            'postId' => $post_id,
            'postType' => $post_type,
            'isHomepage' => (string) get_option('show_on_front') === 'page'
                && (int) get_option('page_on_front') === $post_id,
            'ancestorIds' => $post_type === 'page' ? array_map('intval', get_post_ancestors($post_id)) : [],
            'categoryIds' => $post_type === 'post'
                ? array_map('intval', (array) wp_get_post_categories($post_id, ['fields' => 'ids']))
                : [],
            'tagIds' => $post_type === 'post'
                ? array_map('intval', (array) wp_get_post_terms($post_id, 'post_tag', ['fields' => 'ids']))
                : [],
        ];
    }
}
