package redlib.backend.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.Assert;
import redlib.backend.dto.NotebookNoteDTO;
import redlib.backend.dto.query.NotebookNoteQueryDTO;
import redlib.backend.mapper.NotebookCategoryMapper;
import redlib.backend.mapper.NotebookNoteCategoryMapper;
import redlib.backend.mapper.NotebookNoteMapper;
import redlib.backend.model.NotebookCategory;
import redlib.backend.model.NotebookCategoryLink;
import redlib.backend.model.NotebookNote;
import redlib.backend.model.NotebookNoteCategory;
import redlib.backend.model.Page;
import redlib.backend.service.NotebookNoteService;
import redlib.backend.utils.FormatUtils;
import redlib.backend.utils.NotebookRichTextUtils;
import redlib.backend.utils.NotebookSecurityUtils;
import redlib.backend.utils.PageUtils;
import redlib.backend.vo.NotebookCategoryVO;
import redlib.backend.vo.NotebookNoteVO;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class NotebookNoteServiceImpl implements NotebookNoteService {
    @Autowired
    private NotebookNoteMapper notebookNoteMapper;

    @Autowired
    private NotebookCategoryMapper notebookCategoryMapper;

    @Autowired
    private NotebookNoteCategoryMapper notebookNoteCategoryMapper;

    @Override
    public Page<NotebookNoteVO> list(NotebookNoteQueryDTO queryDTO) {
        Integer userId = NotebookSecurityUtils.currentNotebookUserId();
        if (queryDTO == null) {
            queryDTO = new NotebookNoteQueryDTO();
        }
        queryDTO.setCurrent(PageUtils.page(queryDTO.getCurrent()));
        queryDTO.setPageSize(PageUtils.pageSize(queryDTO.getPageSize()));
        String keyword = FormatUtils.trimToNull(queryDTO.getKeyword());
        Integer total = notebookNoteMapper.countByQuery(userId, keyword, queryDTO.getCategoryId());
        PageUtils pageUtils = new PageUtils(queryDTO.getCurrent(), queryDTO.getPageSize(), total == null ? 0 : total);
        if (total == null || total == 0) {
            return pageUtils.getNullPage();
        }
        List<NotebookNote> notes = notebookNoteMapper.listByQuery(
                userId,
                keyword,
                queryDTO.getCategoryId(),
                pageUtils.getOffset(),
                pageUtils.getLimit());
        return new Page<>(pageUtils.getCurrent(), pageUtils.getPageSize(), pageUtils.getTotal(), buildNoteVOs(notes, false));
    }

    @Override
    public NotebookNoteVO get(Integer id) {
        Assert.notNull(id, "Note id cannot be empty");
        NotebookNote note = getOwnedNote(id);
        return toVO(note, listCategoriesForNotes(Collections.singletonList(note.getId()))
                .getOrDefault(note.getId(), Collections.emptyList()), true);
    }

    @Override
    public Integer add(NotebookNoteDTO noteDTO) {
        Assert.notNull(noteDTO, "Note payload cannot be empty");
        Integer userId = NotebookSecurityUtils.currentNotebookUserId();
        NotebookNote note = new NotebookNote();
        note.setUserId(userId);
        note.setTitle(normalizeTitle(noteDTO.getTitle()));
        applyContent(note, noteDTO);
        Date now = new Date();
        note.setCreatedAt(now);
        note.setUpdatedAt(now);
        note.setFavorite(Boolean.TRUE.equals(noteDTO.getFavorite()));
        notebookNoteMapper.insert(note);
        syncCategories(note.getId(), userId, noteDTO.getCategoryIds());
        return note.getId();
    }

    @Override
    public Integer update(NotebookNoteDTO noteDTO) {
        Assert.notNull(noteDTO, "Note payload cannot be empty");
        Assert.notNull(noteDTO.getId(), "Note id cannot be empty");
        Integer userId = NotebookSecurityUtils.currentNotebookUserId();
        NotebookNote note = getOwnedNote(noteDTO.getId());
        note.setTitle(normalizeTitle(noteDTO.getTitle()));
        applyContent(note, noteDTO);
        if (noteDTO.getFavorite() != null) {
            note.setFavorite(noteDTO.getFavorite());
        }
        note.setUpdatedAt(new Date());
        notebookNoteMapper.updateById(note);
        syncCategories(note.getId(), userId, noteDTO.getCategoryIds());
        return note.getId();
    }

    @Override
    public Integer updateFavorite(NotebookNoteDTO noteDTO) {
        Assert.notNull(noteDTO, "Note payload cannot be empty");
        Assert.notNull(noteDTO.getId(), "Note id cannot be empty");
        Assert.notNull(noteDTO.getFavorite(), "Favorite status cannot be empty");
        NotebookNote note = getOwnedNote(noteDTO.getId());
        note.setFavorite(noteDTO.getFavorite());
        note.setUpdatedAt(new Date());
        notebookNoteMapper.updateById(note);
        return note.getId();
    }

    @Override
    public void delete(List<Integer> ids) {
        Assert.notEmpty(ids, "Note ids cannot be empty");
        Integer userId = NotebookSecurityUtils.currentNotebookUserId();
        Set<Integer> uniqueIds = new LinkedHashSet<>(ids);
        List<NotebookNote> notes = notebookNoteMapper.selectBatchIds(uniqueIds);
        Assert.isTrue(notes.size() == uniqueIds.size(), "Some notes do not exist");
        for (NotebookNote note : notes) {
            Assert.isTrue(userId.equals(note.getUserId()), "Cannot delete another user's note");
        }
        notebookNoteCategoryMapper.delete(new QueryWrapper<NotebookNoteCategory>()
                .in("note_id", uniqueIds));
        notebookNoteMapper.deleteBatchIds(uniqueIds);
    }

    @Override
    public String getOwnedNoteContent(Integer noteId) {
        return getOwnedNote(noteId).getContent();
    }

    private NotebookNote getOwnedNote(Integer noteId) {
        Integer userId = NotebookSecurityUtils.currentNotebookUserId();
        NotebookNote note = notebookNoteMapper.selectById(noteId);
        Assert.notNull(note, "Note does not exist");
        Assert.isTrue(userId.equals(note.getUserId()), "Cannot access another user's note");
        return note;
    }

    private void applyContent(NotebookNote note, NotebookNoteDTO noteDTO) {
        String normalizedRichContent = FormatUtils.trimToNull(noteDTO.getRichContent());
        if (normalizedRichContent != null) {
            NotebookRichTextUtils.SanitizedRichText sanitizedRichText = NotebookRichTextUtils.sanitizeRichContent(normalizedRichContent);
            note.setContent(sanitizedRichText.plainText());
            note.setRichContent(sanitizedRichText.richText());
            return;
        }
        note.setContent(normalizePlainContent(noteDTO.getContent()));
        note.setRichContent(null);
    }

    private void syncCategories(Integer noteId, Integer userId, List<Integer> categoryIds) {
        notebookNoteCategoryMapper.delete(new QueryWrapper<NotebookNoteCategory>()
                .eq("note_id", noteId));
        if (categoryIds == null || categoryIds.isEmpty()) {
            return;
        }
        Set<Integer> uniqueIds = new LinkedHashSet<>(categoryIds);
        List<NotebookCategory> categories = notebookCategoryMapper.selectBatchIds(uniqueIds);
        Assert.isTrue(categories.size() == uniqueIds.size(), "Some categories do not exist");
        for (NotebookCategory category : categories) {
            Assert.isTrue(userId.equals(category.getUserId()), "Cannot bind another user's category");
        }
        for (Integer categoryId : uniqueIds) {
            NotebookNoteCategory relation = new NotebookNoteCategory();
            relation.setNoteId(noteId);
            relation.setCategoryId(categoryId);
            notebookNoteCategoryMapper.insert(relation);
        }
    }

    private List<NotebookNoteVO> buildNoteVOs(List<NotebookNote> notes, boolean includeRichContent) {
        if (notes.isEmpty()) {
            return Collections.emptyList();
        }
        Map<Integer, List<NotebookCategoryVO>> categoryMap = listCategoriesForNotes(notes.stream().map(NotebookNote::getId).toList());
        List<NotebookNoteVO> result = new ArrayList<>();
        for (NotebookNote note : notes) {
            result.add(toVO(note, categoryMap.getOrDefault(note.getId(), Collections.emptyList()), includeRichContent));
        }
        return result;
    }

    private Map<Integer, List<NotebookCategoryVO>> listCategoriesForNotes(List<Integer> noteIds) {
        if (noteIds.isEmpty()) {
            return Collections.emptyMap();
        }
        List<NotebookCategoryLink> links = notebookCategoryMapper.listByNoteIds(noteIds);
        return links.stream().collect(Collectors.groupingBy(
                NotebookCategoryLink::getNoteId,
                Collectors.mapping(this::toCategoryVO, Collectors.toList())));
    }

    private NotebookCategoryVO toCategoryVO(NotebookCategoryLink link) {
        NotebookCategoryVO vo = new NotebookCategoryVO();
        vo.setId(link.getCategoryId());
        vo.setName(link.getCategoryName());
        return vo;
    }

    private NotebookNoteVO toVO(NotebookNote note, List<NotebookCategoryVO> categories, boolean includeRichContent) {
        NotebookNoteVO vo = new NotebookNoteVO();
        BeanUtils.copyProperties(note, vo);
        vo.setCategories(categories);
        /* 列表/JSON 中明确给出 true/false，避免 null 与前端仅识别 boolean 时合并失败 */
        vo.setFavorite(Boolean.TRUE.equals(note.getFavorite()));
        if (includeRichContent) {
            vo.setRichContent(resolveRichContent(note));
        } else {
            vo.setRichContent(null);
        }
        return vo;
    }

    private String resolveRichContent(NotebookNote note) {
        String richContent = FormatUtils.trimToNull(note.getRichContent());
        if (richContent != null) {
            return richContent;
        }
        return NotebookRichTextUtils.fallbackRichContentFromPlainText(note.getContent());
    }

    private String normalizeTitle(String title) {
        title = FormatUtils.trimToNull(title);
        Assert.hasText(title, "Note title cannot be empty");
        return title;
    }

    private String normalizePlainContent(String content) {
        return content == null ? "" : content.trim();
    }
}
