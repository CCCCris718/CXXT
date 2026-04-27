package redlib.backend.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import redlib.backend.model.NotebookNoteCategory;

@Mapper
public interface NotebookNoteCategoryMapper extends BaseMapper<NotebookNoteCategory> {
}
