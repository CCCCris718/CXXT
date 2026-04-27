package redlib.backend.service.impl;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import redlib.backend.mapper.NotebookCategoryMapper;
import redlib.backend.service.NotebookStatisticsService;
import redlib.backend.utils.NotebookSecurityUtils;
import redlib.backend.vo.NotebookCategoryStatVO;

import java.util.List;

@Service
public class NotebookStatisticsServiceImpl implements NotebookStatisticsService {
    @Autowired
    private NotebookCategoryMapper notebookCategoryMapper;

    @Override
    public List<NotebookCategoryStatVO> categoryCounts() {
        return notebookCategoryMapper.statisticsByUserId(NotebookSecurityUtils.currentNotebookUserId());
    }
}
