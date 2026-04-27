package redlib.backend.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.Assert;
import redlib.backend.dto.NotebookCategoryDTO;
import redlib.backend.dto.query.NotebookCategoryQueryDTO;
import redlib.backend.mapper.NotebookCategoryMapper;
import redlib.backend.mapper.NotebookNoteCategoryMapper;
import redlib.backend.model.NotebookCategory;
import redlib.backend.model.NotebookNoteCategory;
import redlib.backend.service.NotebookCategoryService;
import redlib.backend.utils.FormatUtils;
import redlib.backend.utils.NotebookSecurityUtils;
import redlib.backend.vo.NotebookCategoryVO;

import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class NotebookCategoryServiceImpl implements NotebookCategoryService {
    @Autowired
    private NotebookCategoryMapper notebookCategoryMapper;

    @Autowired
    private NotebookNoteCategoryMapper notebookNoteCategoryMapper;

    @Override
    public List<NotebookCategoryVO> list(NotebookCategoryQueryDTO queryDTO) {
        Integer userId = NotebookSecurityUtils.currentNotebookUserId();
        String keyword = queryDTO == null ? null : FormatUtils.trimToNull(queryDTO.getKeyword());
        QueryWrapper<NotebookCategory> queryWrapper = new QueryWrapper<NotebookCategory>()
                .eq("user_id", userId)
                .orderByAsc("id");
        if (keyword != null) {
            queryWrapper.like("name", keyword);
        }
        List<NotebookCategory> categories = notebookCategoryMapper.selectList(queryWrapper);
        List<NotebookCategoryVO> result = new ArrayList<>();
        for (NotebookCategory category : categories) {
            NotebookCategoryVO vo = new NotebookCategoryVO();
            BeanUtils.copyProperties(category, vo);
            result.add(vo);
        }
        return result;
    }

    @Override
    public Integer add(NotebookCategoryDTO categoryDTO) {
        Integer userId = NotebookSecurityUtils.currentNotebookUserId();
        String name = normalizeName(categoryDTO == null ? null : categoryDTO.getName());
        ensureUniqueName(userId, name, null);
        NotebookCategory category = new NotebookCategory();
        category.setUserId(userId);
        category.setName(name);
        Date now = new Date();
        category.setCreatedAt(now);
        category.setUpdatedAt(now);
        notebookCategoryMapper.insert(category);
        return category.getId();
    }

    @Override
    public Integer update(NotebookCategoryDTO categoryDTO) {
        Assert.notNull(categoryDTO, "分类参数不能为空");
        Assert.notNull(categoryDTO.getId(), "分类ID不能为空");
        Integer userId = NotebookSecurityUtils.currentNotebookUserId();
        NotebookCategory category = notebookCategoryMapper.selectById(categoryDTO.getId());
        Assert.notNull(category, "分类不存在");
        Assert.isTrue(userId.equals(category.getUserId()), "无权修改该分类");
        String name = normalizeName(categoryDTO.getName());
        ensureUniqueName(userId, name, category.getId());
        category.setName(name);
        category.setUpdatedAt(new Date());
        notebookCategoryMapper.updateById(category);
        return category.getId();
    }

    @Override
    public void delete(List<Integer> ids) {
        Assert.notEmpty(ids, "分类ID列表不能为空");
        Integer userId = NotebookSecurityUtils.currentNotebookUserId();
        Set<Integer> uniqueIds = new LinkedHashSet<>(ids);
        List<NotebookCategory> categories = notebookCategoryMapper.selectBatchIds(uniqueIds);
        Assert.isTrue(categories.size() == uniqueIds.size(), "存在不存在的分类");
        for (NotebookCategory category : categories) {
            Assert.isTrue(userId.equals(category.getUserId()), "无权删除其他用户的分类");
        }
        notebookNoteCategoryMapper.delete(new QueryWrapper<NotebookNoteCategory>()
                .in("category_id", uniqueIds));
        notebookCategoryMapper.deleteBatchIds(uniqueIds);
    }

    private void ensureUniqueName(Integer userId, String name, Integer excludeId) {
        QueryWrapper<NotebookCategory> queryWrapper = new QueryWrapper<NotebookCategory>()
                .eq("user_id", userId)
                .eq("name", name);
        if (excludeId != null) {
            queryWrapper.ne("id", excludeId);
        }
        Long count = notebookCategoryMapper.selectCount(queryWrapper);
        Assert.isTrue(count == 0, "分类名称已存在");
    }

    private String normalizeName(String name) {
        name = FormatUtils.trimToNull(name);
        Assert.hasText(name, "分类名称不能为空");
        return name;
    }
}
